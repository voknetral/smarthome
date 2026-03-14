import json
import asyncio
import sys
import time
import logging
from logging.handlers import RotatingFileHandler
from paho.mqtt import client as mqtt
from app.core.config import settings
from datetime import datetime, timezone, timedelta
import os
from collections import deque
import threading
import psycopg2
from app.db.session import get_cursor
from app.services.threshold_checker import ThresholdChecker
from app.services.relay_automation import trigger_relay_automation

# --- Logging Setup ---
logger = logging.getLogger("MQTT_Service")
logger.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s', datefmt='%Y-%m-%d %H:%M:%S')

# Console
console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(logging.Formatter('%(asctime)s | %(levelname)-7s | %(message)s', datefmt='%H:%M:%S'))
logger.addHandler(console_handler)

# File
log_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'mqtt_service.log')
file_handler = RotatingFileHandler(log_file, maxBytes=5*1024*1024, backupCount=3)
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(formatter)
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

# Ensure all relevant service logs also go to this file
for logger_name in ["ThresholdChecker", "TelegramService", "RelayAutomation", "MqttPublisher"]:
    l = logging.getLogger(logger_name)
    l.addHandler(file_handler)
    l.setLevel(logging.INFO)

# --- Config ---
# Local loop for running async tasks from sync MQTT callbacks
_async_loop = asyncio.new_event_loop()
threading.Thread(target=_async_loop.run_forever, daemon=True).start()

def run_async(coro):
    """Utility to run async coroutines from sync code"""
    future = asyncio.run_coroutine_threadsafe(coro, _async_loop)
    future.add_done_callback(lambda f: f.exception()) # Ensure exception is retrieved to avoid silencing
    try:
        # Optional: Log if the future fails immediately (though callback handles mostly)
        pass 
    except Exception as e:
        logger.error(f"Async dispatch error: {e}")

    def handle_exception(f):
        try:
            exc = f.exception()
            if exc:
                logger.error(f"ASYNC TASK ERROR: {exc}", exc_info=exc)
        except Exception as e:
            logger.error(f"Error handling async exception: {e}")
    
    future.add_done_callback(handle_exception)


TABLES = {
    "dht22": "data_dht22",
    "pzem004t": "data_pzem004t",
    "mq2": "data_mq2",
    "bh1750": "data_bh1750"
}

MQTT_TOPICS = {
    "dht22": "nusahome/sensor/dht22",
    "pzem004t": "nusahome/sensor/pzem004t",
    "mq2": "nusahome/sensor/mq2",
    "bh1750": "nusahome/sensor/bh1750",
    "relay_cmd": "nusahome/home/relay/+/set",
    "relay_state": "nusahome/home/relay/+/state",
    "relay_mode": "nusahome/home/relay/+/mode",
    "aggregate": "nusahome/home/sensors/aggregate",
    "system_status": "nusahome/system/+/status"
}

# --- Aggregator Logic ---
class DataAggregator:
    def __init__(self, mqtt_client):
        self.client = mqtt_client
        self.buffers = {}  # {sensor: {metric: deque}}
        self.lock = threading.Lock()
        self.running = False
        self.thread = None

    def add_data(self, sensor, data):
        with self.lock:
            if sensor not in self.buffers:
                self.buffers[sensor] = {}

            metrics = {}
            if sensor == "dht22":
                metrics = {
                    "temperature": data.get("temp") or data.get("temperature"),
                    "humidity": data.get("hum") or data.get("humidity")
                }
            elif sensor == "mq2":
                metrics = {
                    "lpg": data.get("lpg") or data.get("gas_lpg") or data.get("LPG"),
                    "co": data.get("co") or data.get("gas_co") or data.get("CO"),
                    "smoke": data.get("smoke") or data.get("Smoke")
                }
            elif sensor == "pzem004t":
                metrics = {
                    "voltage": data.get("voltage"),
                    "current": data.get("current"),
                    "power": data.get("power")
                }
            elif sensor == "bh1750":
                metrics = {"lux": data.get("lux")}

            now = datetime.now(timezone.utc)
            for name, val in metrics.items():
                if val is None: continue
                try:
                    f_val = float(val)
                    if name not in self.buffers[sensor]:
                        self.buffers[sensor][name] = deque()
                    self.buffers[sensor][name].append((now, f_val))

                    # Keep max 70 seconds of data (buffer safety)
                    cutoff = now - timedelta(seconds=70)
                    while self.buffers[sensor][name] and self.buffers[sensor][name][0][0] < cutoff:
                        self.buffers[sensor][name].popleft()
                except: pass

    def get_stats(self):
        now = datetime.now(timezone.utc)
        stats = {"timestamp": now.isoformat()}

        with self.lock:
            for sensor, metrics in self.buffers.items():
                stats[sensor] = {}
                for metric_name, buffer in metrics.items():
                    # FILTER WINDOWS
                    window_30s = [v for t, v in buffer if now - t <= timedelta(seconds=30)]
                    window_60s = [v for t, v in buffer if now - t <= timedelta(seconds=60)]

                    if not window_60s: continue

                    avg_30 = sum(window_30s) / len(window_30s) if window_30s else (sum(window_60s)/len(window_60s))
                    min_60 = min(window_60s)
                    max_60 = max(window_60s)

                    stats[sensor][metric_name] = {
                        "avg_30s": round(avg_30, 2),
                        "min_60s": round(min_60, 2),
                        "max_60s": round(max_60, 2)
                    }

        return stats

    def reporting_loop(self):
        logger.info("AGGREGATOR | Stats reporting loop started")
        while self.running:
            try:
                stats = self.get_stats()
                # Only publish if we have data
                if len(stats.keys()) > 1:
                    self.client.publish(MQTT_TOPICS["aggregate"], json.dumps(stats), qos=1)
                    # logger.debug("AGGREGATOR | Polished payload published")
            except Exception as e:
                logger.error(f"Aggregator error: {e}")
            time.sleep(10) # Publish every 10 seconds for smoothness

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self.reporting_loop, daemon=True)
        self.thread.start()

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=1)

    def update_client(self, new_client):
        with self.lock:
            self.client = new_client

# Global Aggregator
aggregator = None

def check_database_exists():
    try:
        # connect ke postgres (default DB)
        tmp = settings.DB_CONFIG.copy()
        tmp["dbname"] = "postgres"

        with psycopg2.connect(**tmp) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (settings.DB_NAME,))
                return cur.fetchone() is not None

    except Exception as e:
        logger.error(f"Gagal mengecek database: {e}")
        return False


def insert_data(sensor, data):
    table = TABLES.get(sensor)
    if not table:
        logger.warning(f"[{sensor}] Table not defined")
        return

    # WIB (UTC+7)
    wib = timezone(timedelta(hours=7))
    timestamp = data.get("timestamp", datetime.now(wib).strftime("%Y-%m-%d %H:%M:%S"))

    try:
        with get_cursor() as cur:
            if sensor == "dht22":
                temp = data.get("temp") or data.get("temperature")
                hum = data.get("hum") or data.get("humidity")
                cur.execute(
                    f"INSERT INTO {table} (temperature, humidity, timestamp) VALUES (%s, %s, %s)",
                    (temp, hum, timestamp)
                )

            elif sensor == "pzem004t":
                # Convert energy from Wh (Pico raw) to kWh (Backend/Dashboard standard)
                raw_energy = data.get("energy")
                if raw_energy is not None:
                    # Modify the data dict directly so thresholds and DB insert use the kWh value
                    data["energy"] = round(float(raw_energy) / 1000.0, 3)

                freq = data.get("frequency") or data.get("freq")
                cur.execute(
                    f"""INSERT INTO {table}
                    (voltage, current, power, energy, frequency, power_factor, timestamp)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    (
                        data.get("voltage"),
                        data.get("current"),
                        data.get("power"),
                        data.get("energy"),
                        freq,
                        data.get("power_factor"),
                        timestamp
                    )
                )

            elif sensor == "mq2":
                lpg = data.get("lpg") or data.get("gas_lpg") or data.get("LPG")
                co = data.get("co") or data.get("gas_co") or data.get("CO")
                smoke = data.get("smoke") or data.get("Smoke")
                cur.execute(
                    f"INSERT INTO {table} (gas_lpg, gas_co, smoke, timestamp) VALUES (%s, %s, %s, %s)",
                    (lpg, co, smoke, timestamp)
                )

            elif sensor == "bh1750":
                cur.execute(
                    f"INSERT INTO {table} (lux, timestamp) VALUES (%s, %s)",
                    (data.get("lux"), timestamp)
                )

            # Fetch threshold settings and check alerts
            cur.execute("SELECT setting_value FROM app_settings WHERE setting_key = 'thresholds'")
            threshold_row = cur.fetchone()
            cur.execute("SELECT setting_value FROM app_settings WHERE setting_key = 'enable_thresholds'")
            enable_row = cur.fetchone()
            cur.execute("SELECT setting_value FROM app_settings WHERE setting_key = 'alert_cooldown'")
            cooldown_row = cur.fetchone()
            
            # --- FIX START ---
            thresholds = {}
            if threshold_row and threshold_row['setting_value']:
                try:
                    val = threshold_row['setting_value']
                    thresholds = json.loads(val) if isinstance(val, str) else val
                except:
                    thresholds = {}

            enable_thresholds = False
            if enable_row and enable_row['setting_value']:
                val = enable_row['setting_value']
                if isinstance(val, str):
                    enable_thresholds = val.lower() == 'true'
                else:
                    enable_thresholds = bool(val)
            
            alert_cooldown = 300
            if cooldown_row and cooldown_row['setting_value']:
                try:
                    alert_cooldown = int(cooldown_row['setting_value'])
                except:
                    alert_cooldown = 300  
            # --- FIX END ---
            
            # Check thresholds and generate alerts (Async)
            if enable_thresholds:
                run_async(ThresholdChecker.check_and_alert(sensor, data, thresholds, enable_thresholds, alert_cooldown))

            # Trigger immediate relay automation evaluation
            trigger_relay_automation()

        logger.info(f"DATA SAVED | Sensor: {sensor}")

    except Exception as e:
        logger.error(f"DB Error [{sensor}]: {e}")


def on_message(client, userdata, message):
    try:
        topic = message.topic
        payload_str = message.payload.decode('utf-8', errors='replace')

        # Handle relay topics FIRST (payload is plain "ON"/"OFF", not JSON)
        if "home/relay/" in topic and (topic.endswith("/set") or topic.endswith("/state") or topic.endswith("/mode")):
            try:
                parts = topic.split("/")
                # Find relay GPIO index (it's between /relay/ and /action)
                # Example: anomali/home/relay/10/set -> index 3
                # Example: home/relay/10/set -> index 2
                gpio_idx = -1
                for i, part in enumerate(parts):
                    if part == "relay":
                        gpio_idx = i + 1
                        break
                
                if gpio_idx == -1 or gpio_idx >= len(parts):
                    raise ValueError(f"Could not find GPIO ID in topic {topic}")
                
                gpio_id = int(parts[gpio_idx])

                if topic.endswith("/mode"):
                    mode = payload_str.lower()
                    logger.info(f"RELAY MODE  | GPIO: {gpio_id} -> {mode}")
                    with get_cursor() as cur:
                        cur.execute("UPDATE status_relay SET mode = %s WHERE gpio = %s", (mode, gpio_id))
                    return

                is_state_update = topic.endswith("/state")

                # Payload could be JSON {"state": "ON"} or just "ON"
                try:
                    payload = json.loads(payload_str)
                    state_str = payload.get("state") if isinstance(payload, dict) else payload
                except:
                    state_str = payload_str

                state = str(state_str).upper() == "ON" or state_str is True

                if is_state_update:
                    # CONFIRMED HARDWARE STATE: Update DB to reflect reality
                    logger.info(f"RELAY STATE | GPIO: {gpio_id} -> {'ON' if state else 'OFF'}")
                    with get_cursor() as cur:
                        cur.execute("UPDATE status_relay SET is_active = %s WHERE gpio = %s RETURNING name", (state, gpio_id))
                        result = cur.fetchone()
                        relay_name = result['name'] if result else f"GPIO {gpio_id}"

                        # Log to history for state changes (feedback)
                        status_text = "ON" if state else "OFF"
                        status_class = "text-green-600" if state else "text-slate-600"
                        cur.execute(
                            "INSERT INTO app_history (event, status, status_class) VALUES (%s, %s, %s)",
                            (f"{relay_name} status verified", status_text, status_class)
                        )
                else:
                    # /set is a COMMAND: API already handles DB update. Just log for observability.
                    logger.info(f"RELAY CMD   | GPIO: {gpio_id} -> {'ON' if state else 'OFF'}")
            except Exception as e:
                logger.error(f"Relay Sync Error: {e}")
            return

        # Handle system status topics (Pico lifecycle)
        if "system/" in topic and topic.endswith("/status"):
            try:
                # Robust parsing for system status
                clean_payload = payload_str.replace("nan", "null").replace("inf", "null")
                payload = json.loads(clean_payload)
                status = payload.get("status", "UNKNOWN")
                device_id = payload.get("device_id", "PicoW")
                
                # We only log important transitions, skip heartbeats (ALIVE) to avoid spamming DB
                if status not in ["ALIVE", "UNKNOWN"]:
                    status_map = {
                        "READY": ("Online", "text-green-600"),
                        "OFFLINE": ("Offline", "text-red-600"),
                        "ERROR": ("Error", "text-blue-600"),
                        "BOOTING": ("Booting", "text-yellow-600")
                    }
                    
                    label, s_class = status_map.get(status, (status, "text-slate-600"))
                    
                    with get_cursor() as cur:
                        cur.execute(
                            "INSERT INTO app_history (event, status, status_class) VALUES (%s, %s, %s)",
                            (f"Device {device_id} status updated", label, s_class)
                        )
                    logger.info(f"STATUS     | {device_id} -> {label}")
            except Exception as e:
                logger.error(f"Status Parse Error: {e}")
            return

        # For sensor topics, parse as JSON
        try:
            # ROBUST PARSING: Replace nan/inf with null before parsing so standard JSON parsers don't fail
            # This handles cases where sensors might send uninitialized or error values
            clean_payload = payload_str.replace("nan", "null").replace("inf", "null").replace("NaN", "null")
            payload = json.loads(clean_payload)
        except Exception as e:
            logger.warning(f"Message JSON Parse Error on topic {topic}: {e} | Payload: {payload_str}")
            return

        for sensor_id, topic_key in MQTT_TOPICS.items():
            # Skip relay & aggregate topics from DB insertion
            if sensor_id in ["relay_cmd", "relay_state", "aggregate"]:
                continue

            # Standard topics
            if topic == topic_key:
                insert_data(sensor_id, payload)
                if aggregator:
                    aggregator.add_data(sensor_id, payload)
                break

    except Exception as e:
        logger.error(f"Message Parse Error: {e}")


def on_connect(client, userdata, flags, rc, properties=None):
    rc_value = getattr(rc, "value", rc)
    if rc_value == 0:
        logger.info(f"CONNECTED  | [PID: {os.getpid()}] MQTT Broker Connection Successful")
        for topic in MQTT_TOPICS.values():
            client.subscribe(topic)
            logger.debug(f"Subscribed: {topic}")
    else:
        logger.error(f"CONNECTION FAILED | [PID: {os.getpid()}] RC={rc_value}")

def on_disconnect(client, userdata, disconnect_flags, rc, properties=None):
    rc_value = getattr(rc, "value", rc)
    if rc_value == 0:
        logger.info(f"DISCONNECTED | [PID: {os.getpid()}] Normal shutdown")
    else:
        logger.warning(f"DISCONNECTED | [PID: {os.getpid()}] Unexpected (RC={rc_value}). Auto-reconnect active.")

def get_mqtt_settings():
    try:
        with psycopg2.connect(**settings.DB_CONFIG) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT setting_value FROM app_settings WHERE setting_key = 'mqtt_config'")
                res = cur.fetchone()
                if res:
                    return res[0]
    except Exception as e:
        logger.debug(f"Failed to fetch settings from DB: {e}")
    return {
        "host": settings.MQTT_BROKER,
        "port": settings.MQTT_PORT,
        "ws_port": 8884,
        "useSSL": False
    }

def run_mqtt_service(stop_event=None):
    logger.info("STARTUP    | Checking database...")
    if not check_database_exists():
        logger.critical("DATABASE ERROR | Database not found.")
        if not stop_event:
            sys.exit(1)
        return

    logger.info("SERVICE    | Starting MQTT Listener Service...")

    global aggregator
    # Initialize aggregator once with None client, will be updated when connected
    aggregator = DataAggregator(None)
    aggregator.start()

    last_config = None

    while not (stop_event and stop_event.is_set()):
        current_config = get_mqtt_settings()

        # Only reconnect if host/port changed or it's the first run
        if last_config is None or \
           current_config["host"] != last_config["host"] or \
           current_config["port"] != last_config["port"] or \
           current_config.get("useSSL") != last_config.get("useSSL"):

            broker = current_config["host"]
            last_config = current_config.copy()

            try:
                # Determine transport and port based on useSSL (Dashboard's toggle)
                use_ssl = current_config.get("useSSL", False)
                transport = "websockets" if use_ssl else "tcp"
                
                # If using WebSockets, use the ws_port provided by settings
                if use_ssl:
                    port = int(current_config.get("ws_port", 8884))
                    logger.info(f"MQTT CONFIG | Using WebSockets (SSL/TLS) on port {port}")
                else:
                    port = int(current_config.get("port", 1883))
                    logger.info(f"MQTT CONFIG | Using Standard TCP on port {port}")

                client_id = f"mqtt_service_listener_{os.getpid()}_{int(time.time())}"
                client = mqtt.Client(
                    callback_api_version=mqtt.CallbackAPIVersion.VERSION2, 
                    client_id=client_id,
                    transport=transport
                )

                client.on_connect = on_connect
                client.on_disconnect = on_disconnect
                client.on_message = on_message
                client.reconnect_delay_set(min_delay=5, max_delay=60)
                
                if use_ssl:
                    client.tls_set() # Enable SSL for WSS

                # Update aggregator's client reference
                aggregator.update_client(client)

                # Use connect_async + loop_start for non-blocking
                client.connect_async(broker, port, keepalive=60)
                client.loop_start()

                logger.info("SERVICE    | Listening for messages...")

                # Inner loop just waits for stop_event or config change
                check_interval = 30 # Check DB every 30s
                while not (stop_event and stop_event.is_set()):
                    time.sleep(1)
                    check_interval -= 1
                    if check_interval <= 0:
                        # Time to check if config changed in DB
                        new_config = get_mqtt_settings()
                        if new_config["host"] != last_config["host"] or \
                           new_config["port"] != last_config["port"] or \
                           new_config.get("useSSL") != last_config.get("useSSL"):
                            logger.info("CONFIG     | Detected settings change, reconnecting...")
                            break # Exit inner loop to reconnect
                        check_interval = 30

                client.loop_stop()
                client.disconnect()

            except Exception as e:
                logger.error(f"CRITICAL   | Setup error: {e}")
                time.sleep(10)
        else:
            # Config didn't change, but we are in the outer loop (maybe after an error)
            time.sleep(5)

    if aggregator:
        aggregator.stop()

if __name__ == "__main__":
    run_mqtt_service()
