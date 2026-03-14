# ==============================================
# NUSAHOME - Status Manager
# ==============================================

import time
import json


class StatusManager:

    VALID_STATES = [
        "BOOTING",
        "WIFI_CONNECTING",
        "WIFI_CONNECTED",
        "SENSORS_INIT",
        "SENSORS_ERROR",
        "MQTT_CONNECTING",
        "MQTT_CONNECTED",
        "READY",
        "ALIVE",
        "DEGRADED",
        "ERROR",
        "OFFLINE"
    ]

    def __init__(self, device_id, topic):
        self.device_id = device_id
        self.topic = topic
        self.mqtt_client = None

        self.current_state = "BOOTING"
        self.previous_state = None

        self.boot_time = time.time()
        self.last_heartbeat = 0
        self.last_state_change = time.time()

        self.error_count = 0
        self.recovery_attempts = 0

        self.ip_address = None
        self.signal_strength = None
        self.sensor_health = {}

    # ------------------------------------------------
    # Setters
    # ------------------------------------------------
    def set_mqtt_client(self, client):
        self.mqtt_client = client

    def set_ip(self, ip):
        self.ip_address = ip

    def set_signal_strength(self, rssi):
        self.signal_strength = rssi

    # ------------------------------------------------
    # Sensor Health
    # ------------------------------------------------
    def update_sensor_health(self, sensor_name, is_healthy, error_msg=""):
        self.sensor_health[sensor_name] = {
            "healthy": is_healthy,
            "error": error_msg,
            "timestamp": int(time.time())
        }

    # ------------------------------------------------
    # Time Helpers
    # ------------------------------------------------
    def get_uptime(self):
        return int(time.time() - self.boot_time)

    def get_state_duration(self):
        return int(time.time() - self.last_state_change)

    # ------------------------------------------------
    # Payload Builders
    # ------------------------------------------------
    def get_lwt_payload(self):
        return json.dumps({
            "device_id": self.device_id,
            "status": "OFFLINE",
            "display_status": "Offline",
            "reason": "connection_lost",
            "uptime": self.get_uptime()
        })

    def _build_payload(self, extra=None):
        payload = {
            "device_id": self.device_id,
            "status": self.current_state,
            "display_status": "Online" if self.current_state not in ["OFFLINE", "ERROR"] else "Offline",
            "uptime": self.get_uptime(),
            "state_duration": self.get_state_duration(),
            "error_count": self.error_count,
            "recovery_attempts": self.recovery_attempts,
            "timestamp": int(time.time())
        }

        if self.ip_address:
            payload["ip"] = self.ip_address

        if self.signal_strength is not None:
            payload["signal_strength"] = self.signal_strength

        unhealthy = {k: v for k, v in self.sensor_health.items() if not v["healthy"]}
        if unhealthy:
            payload["sensor_issues"] = unhealthy

        if extra:
            payload.update(extra)

        return payload

    # ------------------------------------------------
    # State Control
    # ------------------------------------------------
    def transition(self, new_state, extra=None, publish=True, reason=""):
        if new_state not in self.VALID_STATES:
            print(f"[Status] Invalid state: {new_state}")
            return False

        old_state = self.current_state

        if old_state == new_state:
            return False

        duration = self.get_state_duration()

        self.previous_state = old_state
        self.current_state = new_state
        self.last_state_change = time.time()

        if new_state == "READY" and old_state != "READY":
            self.recovery_attempts += 1

        reason_str = f" ({reason})" if reason else ""
        print(f"[Status] {old_state} → {new_state} [Duration: {duration}s]{reason_str}")

        if publish and self.mqtt_client:
            self.publish(extra)

        return True

    def error(self, error_msg=""):
        self.error_count += 1
        print(f"[Status] ERROR #{self.error_count}: {error_msg}")

        target = "ERROR" if self.error_count >= 3 else "DEGRADED"
        self.transition(target, extra={"error": error_msg}, reason=error_msg)

    # ------------------------------------------------
    # MQTT
    # ------------------------------------------------
    def publish(self, extra=None):
        if not self.mqtt_client:
            print("[Status] No MQTT client, skipping publish")
            return False

        try:
            payload = self._build_payload(extra)
            self.mqtt_client.publish(self.topic, json.dumps(payload), qos=1)
            print(f"[Status] Published: {self.current_state}")
            return True
        except Exception as e:
            print(f"[Status] Publish error: {e}")
            return False

    # ------------------------------------------------
    # Heartbeat
    # ------------------------------------------------
    def heartbeat(self, force=False):
        from config import HEARTBEAT_INTERVAL

        now = time.time()
        interval = max(HEARTBEAT_INTERVAL, 15)

        if force or (now - self.last_heartbeat >= interval):
            self.last_heartbeat = now

            if self.current_state in ["READY", "ALIVE"]:
                self.current_state = "ALIVE"
                return self.publish()

            return True

        return False

    # ------------------------------------------------
    # Helpers
    # ------------------------------------------------
    def reset_to_ready(self):
        self.transition("READY")


# ------------------------------------------------
# Global Access
# ------------------------------------------------
_status_manager = None


def init(device_id, topic):
    global _status_manager
    _status_manager = StatusManager(device_id, topic)
    return _status_manager


def get():
    return _status_manager

