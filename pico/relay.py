# ==============================================
# NUSAHOME - Relay Control Module
# ==============================================

import time
import urequests
from machine import Pin

from config import (
    RELAY_PINS,
    API_BASE_URL,
    SYNC_RETRY_MAX,
    SYNC_RETRY_DELAY,
    RELAY_ACTIVE_LOW,
)

# ------------------------------------------------
# Globals
# ------------------------------------------------
relays = {}
relay_state = {}
mqtt_client = None


# ------------------------------------------------
# Init Hardware
# ------------------------------------------------
for gpio in RELAY_PINS:
    pin = Pin(gpio, Pin.OUT)

    # Default OFF
    pin.value(1 if RELAY_ACTIVE_LOW else 0)

    relays[gpio] = pin
    relay_state[gpio] = False


# ------------------------------------------------
# Helpers
# ------------------------------------------------
def set_mqtt_client(client):
    global mqtt_client
    mqtt_client = client


def _gpio_to_value(state: bool) -> int:
    if RELAY_ACTIVE_LOW:
        return 0 if state else 1
    return 1 if state else 0


def _write_relay(gpio: int, state: bool):
    value = _gpio_to_value(state)

    relays[gpio].value(value)
    relay_state[gpio] = state

    print(
        "[Relay] GPIO", gpio,
        "STATE", "ON" if state else "OFF",
        "PIN", value
    )


# ------------------------------------------------
# Public API
# ------------------------------------------------
def set_state(gpio: int, state: bool) -> bool:
    if gpio not in relays:
        print("[Relay] Invalid GPIO:", gpio)
        return False

    _write_relay(gpio, bool(state))
    return True


def get_state(gpio: int) -> bool:
    return relay_state.get(gpio, False)


def sync_from_api():
    print("[Relay] Syncing from API")

    for attempt in range(1, SYNC_RETRY_MAX + 1):
        try:
            r = urequests.get(API_BASE_URL + "/relays", timeout=5)

            if r.status_code == 200:
                data = r.json()
                synced = 0

                for item in data:
                    gpio = item.get("gpio")
                    state = bool(item.get("is_active", False))

                    if gpio in relays:
                        _write_relay(gpio, state)
                        synced += 1

                r.close()
                print("[Relay] Synced", synced, "relay(s)")
                return True

            r.close()

        except Exception as e:
            print("[Relay] Attempt", attempt, "failed:", e)

        time.sleep(SYNC_RETRY_DELAY)

    print("[Relay] Sync failed")
    return False


# ------------------------------------------------
# MQTT
# ------------------------------------------------
def _parse_topic(topic: str):
    parts = topic.split("/")

    # legacy: home/relay/{gpio}/set
    if len(parts) == 4:
        return parts[1], parts[2], parts[3]

    # new: nusahome/home/relay/{gpio}/set
    if len(parts) == 5:
        return parts[2], parts[3], parts[4]

    return None, None, None


def on_mqtt_message(topic, msg):
    try:
        topic = topic.decode()
        payload = msg.decode().strip().upper()

        relay_kw, gpio_str, cmd = _parse_topic(topic)

        if relay_kw != "relay" or cmd != "set":
            return

        gpio = int(gpio_str)

        if payload in ("ON", "1", "TRUE"):
            state = True
        elif payload in ("OFF", "0", "FALSE"):
            state = False
        else:
            print("[Relay] Invalid payload:", payload)
            return

        if set_state(gpio, state):

            if mqtt_client:
                try:
                    mqtt_client.publish(
                        f"nusahome/home/relay/{gpio}/state",
                        "ON" if state else "OFF",
                        qos=1
                    )
                except Exception as e:
                    print("[Relay] MQTT publish error:", e)

    except Exception as e:
        print("[Relay] MQTT error:", e)


# ------------------------------------------------
# Test
# ------------------------------------------------
def test_relays(delay=1):
    print("[Relay] HARDWARE TEST START")

    for gpio in RELAY_PINS:
        print("ON  GPIO", gpio)
        set_state(gpio, True)
        time.sleep(delay)

        print("OFF GPIO", gpio)
        set_state(gpio, False)
        time.sleep(0.5)

    print("[Relay] HARDWARE TEST DONE")

