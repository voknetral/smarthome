# ==============================================
# NUSAHOME - BH1750 Light Sensor Module
# ==============================================

import time
from machine import Pin, I2C
from config import BH1750_SDA_PIN, BH1750_SCL_PIN, BH1750_ADDR


# ------------------------------------------------
# Config
# ------------------------------------------------
I2C_FREQ = 400_000
MIN_READ_INTERVAL = 0.2
MAX_RETRY = 2

POWER_ON = 0x01
CONT_HI_RES = 0x10


# ------------------------------------------------
# Globals
# ------------------------------------------------
_i2c = I2C(
    0,
    sda=Pin(BH1750_SDA_PIN),
    scl=Pin(BH1750_SCL_PIN),
    freq=I2C_FREQ
)

_initialized = False
_last_read = 0


# ------------------------------------------------
# Init
# ------------------------------------------------
def init():
    global _initialized

    try:
        _i2c.writeto(BH1750_ADDR, bytes([POWER_ON]))
        time.sleep(0.01)

        _i2c.writeto(BH1750_ADDR, bytes([CONT_HI_RES]))
        time.sleep(0.18)

        _initialized = True
        print("[BH1750] Initialized")
        return True

    except Exception as e:
        print("[BH1750] Init error:", e)
        _initialized = False
        return False


# ------------------------------------------------
# Read
# ------------------------------------------------
def read():
    global _last_read

    if not _initialized:
        return None

    now = time.time()
    if now - _last_read < MIN_READ_INTERVAL:
        return None

    for attempt in range(1, MAX_RETRY + 1):
        try:
            raw = _i2c.readfrom(BH1750_ADDR, 2)
            lux = ((raw[0] << 8) | raw[1]) / 1.2

            if lux < 0:
                raise ValueError("Invalid lux")

            _last_read = now
            return {"lux": round(lux, 1)}

        except Exception as e:
            if attempt == MAX_RETRY:
                print("[BH1750] Read error:", e)

            time.sleep(0.05)

    return None

