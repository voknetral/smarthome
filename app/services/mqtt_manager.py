import json
import uuid
import time
import logging
import paho.mqtt.client as mqtt
from app.core.config import settings

# dedicated logger for persistent publisher
pub_logger = logging.getLogger("MqttPublisher")

class MqttManager:
    def __init__(self):
        self.client = None
        self.connected = False
        self._current_broker = None
        self._current_port = None
        self._last_settings_check = 0
        self._settings_cache_ttl = 30  # seconds
        # Use UUID to prevent collisions between multiple worker processes
        self.client_id = f"fastapi_backend_{uuid.uuid4().hex[:8]}"

    def _get_dynamic_settings(self):
        """Fetch current MQTT settings with caching to reduce DB load"""
        now = time.time()
        if self._current_broker and (now - self._last_settings_check < self._settings_cache_ttl):
            return self._current_broker, self._current_port, False

        from app.db.session import get_cursor
        self._last_settings_check = now
        try:
            with get_cursor() as cur:
                cur.execute("SELECT setting_value FROM app_settings WHERE setting_key = 'mqtt_config'")
                res = cur.fetchone()
                if res and res['setting_value']:
                    cfg = res['setting_value']
                    if isinstance(cfg, str):
                        cfg = json.loads(cfg)
                    
                    return (
                        cfg.get("host", settings.MQTT_BROKER), 
                        int(cfg.get("port", settings.MQTT_PORT)),
                        cfg.get("useSSL", False),
                        int(cfg.get("ws_port", 8884))
                    )
        except Exception as e:
            pub_logger.debug(f"Dynamic settings fetch error: {e}")
            
        return settings.MQTT_BROKER, settings.MQTT_PORT, False, 8884

    def on_connect(self, client, userdata, flags, rc, properties=None):
        # rc for MQTT v5 is a ReasonCode object
        rc_code = rc.value if hasattr(rc, "value") else rc
        if rc_code == 0:
            self.connected = True
            pub_logger.info(f"MQTT PERSISTENT | Link Established: {self._current_broker}:{self._current_port}")
        else:
            self.connected = False
            pub_logger.error(f"MQTT PERSISTENT | Link Failed: RC={rc_code}")

    def on_disconnect(self, client, userdata, flags, rc, properties=None):
        self.connected = False
        rc_code = rc.value if hasattr(rc, "value") else rc
        if rc_code != 0:
            pub_logger.warning(f"MQTT PERSISTENT | Link Lost (RC={rc_code}). Auto-reconnecting...")

    def connect(self):
        """Initialize or update the persistent connection"""
        broker, port, use_ssl, ws_port = self._get_dynamic_settings()
        
        # Check if we already have an active client for these settings
        if self.client and self.client.is_connected() and \
           broker == self._current_broker and port == self._current_port:
            self.connected = True
            return

        self._current_broker = broker
        self._current_port = port
        
        try:
            if self.client:
                pub_logger.debug("MQTT PERSISTENT | Cleaning up old client...")
                try:
                    self.client.loop_stop()
                    self.client.disconnect()
                except:
                    pass

            transport = "websockets" if use_ssl else "tcp"
            if use_ssl:
                port = ws_port

            self.client = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                client_id=self.client_id,
                protocol=mqtt.MQTTv311,
                transport=transport
            )
            self.client.on_connect = self.on_connect
            self.client.on_disconnect = self.on_disconnect
            self.client.reconnect_delay_set(min_delay=1, max_delay=30)
            
            if use_ssl:
                pub_logger.info("MQTT PERSISTENT | Enabling TLS/SSL (WSS)")
                self.client.tls_set()
            
            pub_logger.info(f"MQTT PERSISTENT | Initializing {transport.upper()} connection to {broker}:{port}")
            self.client.connect_async(broker, port, keepalive=60)
            self.client.loop_start()
        except Exception as e:
            pub_logger.error(f"MQTT PERSISTENT | Connect error: {e}")

    def disconnect(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            self.connected = False
            pub_logger.info("MQTT PERSISTENT | Manual Disconnect")

    def publish(self, topic: str, payload: str, retain: bool = False):
        """Publish message with internal retry and safe single-publish fallback."""
        if not self.client:
            self.connect()

        # Attempt up to 2 times for persistent link
        for attempt in range(2):
            try:
                # rc=0 means successfully queued
                result = self.client.publish(topic, payload, qos=1, retain=retain)
                if result.rc == mqtt.MQTT_ERR_SUCCESS:
                    pub_logger.info(f"MQTT PERSISTENT | Queued QoS 1: {topic}")
                    return
                
                # If we get RC=4 (No Connection), try to force a reconnect and retry
                if result.rc == 4:
                    pub_logger.warning(f"MQTT PERSISTENT | Not connected (RC=4). Retrying {attempt+1}/2...")
                    self.connect()
                    time.sleep(0.1) # Small gap for handshake
                    continue

                pub_logger.error(f"MQTT PERSISTENT | Queue Failed (RC={result.rc})")
            except Exception as e:
                pub_logger.error(f"MQTT PERSISTENT | Publish exception: {e}")
            
            if attempt == 0: time.sleep(0.1)

        # FINAL FALLBACK: Single-sync publish (Slow but guaranteed)
        pub_logger.warning(f"MQTT PERSISTENT | Persistent link failed. Using single-publish(QoS1) fallback...")
        import paho.mqtt.publish as p_single
        try:
            broker, port, use_ssl, ws_port = self._get_dynamic_settings()
            if use_ssl:
                port = ws_port
                
            p_single.single(
                topic,
                payload=payload,
                hostname=broker,
                port=port,
                client_id=f"{self.client_id}_fb",
                retain=retain,
                qos=1,
                transport="websockets" if use_ssl else "tcp",
                tls={'ca_certs': None} if use_ssl else None
            )
            pub_logger.info(f"MQTT FALLBACK | Published QoS 1 to {topic}")
        except Exception as e:
            pub_logger.error(f"MQTT FALLBACK | Fatal crash: {e}")

# Global instance
mqtt_manager = MqttManager()
