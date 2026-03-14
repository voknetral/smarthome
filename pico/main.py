# ==============================================
# NUSAHOME - Main Application
# ==============================================

import time
import json
from umqtt.simple import MQTTClient
import urequests

import wifi
import relay
import sensor_dht22 as dht22
import sensor_pzem
import sensor_bh1750 as bh1750
import sensor_mq2 as mq2
import status_manager

from config import (
    MQTT_BROKER,
    MQTT_PORT,
    MQTT_CLIENT_ID,

    TOPIC_DHT22,
    TOPIC_PZEM004T,
    TOPIC_BH1750,
    TOPIC_MQ2,
    TOPIC_RELAY_CMD,
    TOPIC_INTERVAL,
    TOPIC_STATUS,

    API_BASE_URL,
    SENSOR_READ_INTERVAL,
    MIN_SAFE_SENSOR_INTERVAL,
    RELAY_SYNC_INTERVAL,

    DHT22_PIN,
    PZEM_TX_PIN,
    PZEM_RX_PIN,
    BH1750_SDA_PIN,
    BH1750_SCL_PIN,
    RELAY_PINS,
    MQ2_PIN,

    HEARTBEAT_INTERVAL,
    MQTT_KEEPALIVE,
    MQTT_RECONNECT_MAX,
    MQTT_RECONNECT_DELAY
)

# ------------------------------------------------
# Globals
# ------------------------------------------------
mqtt_client = None
status_mgr = None

sensor_interval = SENSOR_READ_INTERVAL
last_sensor_read = 0
last_relay_sync = 0
last_heartbeat = 0
last_online_time = time.ticks_ms()
mqtt_reconnect_count = 0
FAILSAFE_TIMEOUT_MS = 300000 # 5 minutes


# ------------------------------------------------
# API
# ------------------------------------------------
def fetch_interval_from_api():
    global sensor_interval

    try:
        r = urequests.get(API_BASE_URL + "/settings", timeout=5)

        if r.status_code == 200:
            data = r.json()
            interval = data.get("settings", {}).get("update_interval")

            if isinstance(interval, int) and interval > 0:
                validated = max(interval, MIN_SAFE_SENSOR_INTERVAL)
                sensor_interval = validated

                msg = f"[Info] Interval synchronized: {validated}s"
                if validated != interval:
                    msg += f" (Adjusted from {interval}s)"
                print(msg)

        r.close()

    except Exception as e:
        print("[API] Interval fetch error:", e)


# ------------------------------------------------
# MQTT
# ------------------------------------------------
def on_mqtt_message(topic, msg):
    global sensor_interval

    topic_str = topic.decode()
    payload = msg.decode()

    if topic_str == TOPIC_INTERVAL:
        try:
            data = json.loads(payload)
            interval = data.get("interval")
            
            if isinstance(interval, int) and interval > 0:
                validated = max(interval, MIN_SAFE_SENSOR_INTERVAL)
                sensor_interval = validated

                msg = f"[MQTT] Interval updated: {validated}s"
                if validated != interval:
                    msg += f" (Adjusted from {interval}s)"
                print(msg)

        except Exception as e:
            print("[MQTT] Interval parse error:", e)

        return

    relay.on_mqtt_message(topic, msg)


def connect_mqtt():
    global mqtt_client, mqtt_reconnect_count

    try:
        if mqtt_client:
            try:
                mqtt_client.disconnect()
            except:
                pass

        print("[MQTT] Connecting to", MQTT_BROKER)

        lwt_payload = (
            status_mgr.get_lwt_payload()
            if status_mgr else '{"status":"OFFLINE"}'
        )

        mqtt_client = MQTTClient(
            MQTT_CLIENT_ID,
            MQTT_BROKER,
            port=MQTT_PORT,
            keepalive=MQTT_KEEPALIVE
        )

        mqtt_client.set_last_will(TOPIC_STATUS, lwt_payload, retain=False, qos=1)
        mqtt_client.set_callback(on_mqtt_message)
        mqtt_client.connect()

        mqtt_client.subscribe(TOPIC_RELAY_CMD, qos=1)
        mqtt_client.subscribe(TOPIC_INTERVAL, qos=1)

        relay.set_mqtt_client(mqtt_client)

        if status_mgr:
            status_mgr.set_mqtt_client(mqtt_client)
            status_mgr.transition("MQTT_CONNECTED")

        mqtt_reconnect_count = 0
        print("[MQTT] Connected")

        return True

    except Exception as e:
        print("[MQTT] Connection failed:", e)
        mqtt_client = None
        if status_mgr:
            status_mgr.error("mqtt_connect_failed")
        return False


def reconnect_mqtt_with_backoff():
    global mqtt_reconnect_count

    if mqtt_reconnect_count >= MQTT_RECONNECT_MAX:
        print("[MQTT] Max retries reached")
        if status_mgr:
            status_mgr.error("mqtt_max_retries")
        return False

    mqtt_reconnect_count += 1

    delay = MQTT_RECONNECT_DELAY * (2 ** (mqtt_reconnect_count - 1))
    delay = min(delay, 30)

    print(f"[MQTT] Reconnect #{mqtt_reconnect_count} in {delay}s")
    time.sleep(delay)

    return connect_mqtt()


# ------------------------------------------------
# Sensors
# ------------------------------------------------
def publish_sensors():
    if not mqtt_client:
        return

    for topic, reader in (
        (TOPIC_DHT22, dht22.read),
        (TOPIC_PZEM004T, sensor_pzem.read),
        (TOPIC_BH1750, bh1750.read),
        (TOPIC_MQ2, mq2.read),
    ):
        try:
            data = reader()
            if data:
                mqtt_client.publish(topic, json.dumps(data), qos=1)
        except Exception as e:
            print("[Sensor] Publish error:", e)


# ------------------------------------------------
# Main
# ------------------------------------------------
def main():
    global mqtt_client, last_sensor_read, last_relay_sync, last_heartbeat, status_mgr

    print("------------------------------------------")
    print("        NUSA HOME SYSTEM - PICO W")
    print("------------------------------------------")

    status_mgr = status_manager.init(MQTT_CLIENT_ID, TOPIC_STATUS)
    print("[Status] BOOTING")

    if not wifi.connect():
        print("[WiFi] Failed, aborting")
        return

    status_mgr.set_ip(wifi.get_ip())
    status_mgr.transition("WIFI_CONNECTED", publish=False)

    fetch_interval_from_api()

    bh1750.init()
    mq2.init()
    status_mgr.transition("SENSORS_INIT", publish=False)

    # relay.sync_from_api() is now called after MQTT connection
    # last_relay_sync = time.time()

    if connect_mqtt():
        status_mgr.transition("READY")
        relay.sync_from_api() # Sync relays once control link is established
        last_relay_sync = time.time()

    print("SYSTEM READY")
    print("Interval :", sensor_interval, "s")

    last_heartbeat = time.ticks_ms()
    last_sensor_read = time.ticks_ms()
    last_relay_sync = time.ticks_ms()
    last_online_time = time.ticks_ms()

    while True:
        try:
            now = time.ticks_ms()

            # --- MQTT ---
            if mqtt_client:
                try:
                    mqtt_client.check_msg()
                    last_online_time = now # Consider successful check_msg as "online"
                except:
                    print("[MQTT] check_msg failed")
                    mqtt_client = None

            # --- WIFI ---
            if not wifi.is_connected():
                print("[WiFi] Lost connection")
                status_mgr.transition("ERROR", {"reason": "wifi_lost"})

                if wifi.reconnect():
                    status_mgr.set_ip(wifi.get_ip())
                    if connect_mqtt():
                        relay.sync_from_api()
                        last_relay_sync = now
                        last_online_time = now
            else:
                if mqtt_client:
                    last_online_time = now

            if mqtt_client is None:
                reconnect_mqtt_with_backoff()

            # --- FAILSAFE ---
            # If offline for too long, turn off all relays for safety
            if time.ticks_diff(now, last_online_time) > FAILSAFE_TIMEOUT_MS:
                print("[FAILSAFE] Offline too long! Turning OFF all relays.")
                for gpio in RELAY_PINS:
                    relay.set_state(gpio, False)
                status_mgr.transition("ERROR", {"reason": "failsafe_offline"})
                # Reset online time slightly so we don't spam print
                last_online_time = now - FAILSAFE_TIMEOUT_MS + 60000 

            # --- TASKS ---
            if time.ticks_diff(now, last_sensor_read) >= sensor_interval * 1000:
                publish_sensors()
                last_sensor_read = now

            if time.ticks_diff(now, last_relay_sync) >= RELAY_SYNC_INTERVAL * 1000:
                relay.sync_from_api()
                fetch_interval_from_api()
                last_relay_sync = now

            if time.ticks_diff(now, last_heartbeat) >= HEARTBEAT_INTERVAL * 1000:
                status_mgr.heartbeat(force=True)
                last_heartbeat = now

            time.sleep(0.05)

        except Exception as e:
            print("[MAIN] Loop error:", e)
            if status_mgr:
                status_mgr.error("main_loop_error")
            time.sleep(2)


if __name__ == "__main__":
    main()

