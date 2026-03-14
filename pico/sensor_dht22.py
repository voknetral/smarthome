# ==============================================
# NUSAHOME - DHT22 Sensor Module
# ==============================================

import time
from machine import Pin
from dht import DHT22
from config import DHT22_PIN


# ------------------------------------------------
# Config
# ------------------------------------------------
MIN_READ_INTERVAL = 2.0
MAX_RETRY = 2


# ------------------------------------------------
# Globals
# ------------------------------------------------
_sensor = DHT22(Pin(DHT22_PIN))
_last_read = 0


# ------------------------------------------------
# Read
# ------------------------------------------------
def read():
    global _last_read

    now = time.time()
    if now - _last_read < MIN_READ_INTERVAL:
        return None

    for attempt in range(1, MAX_RETRY + 1):
        try:
            _sensor.measure()

            temp = _sensor.temperature()
            hum = _sensor.humidity()

            if temp is None or hum is None:
                raise ValueError("Invalid DHT22 reading")

            if not (-40 <= temp <= 80 and 0 <= hum <= 100):
                raise ValueError("Out-of-range DHT22 value")

            _last_read = now

            return {
                "temperature": round(temp, 1),
                "humidity": round(hum, 1)
            }

        except Exception as e:
            if attempt == MAX_RETRY:
                print("[DHT22] Read error:", e)

            time.sleep(0.2)

    return None

