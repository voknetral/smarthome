# ==============================================
# NUSAHOME - PZEM-004T Power Sensor Module
# ==============================================

import time
from machine import UART, Pin
from pzem import PZEM
from config import PZEM_TX_PIN, PZEM_RX_PIN


# ------------------------------------------------
# UART Init
# ------------------------------------------------
_uart = UART(
    0,
    baudrate=9600,
    tx=Pin(PZEM_TX_PIN),
    rx=Pin(PZEM_RX_PIN),
    timeout=250
)

time.sleep(1)

_pzem = PZEM(uart=_uart)

try:
    _pzem.setAddress(0x05)
except Exception:
    pass


# ------------------------------------------------
# Read
# ------------------------------------------------
def read():
    try:
        if not _pzem.read():
            return None

        voltage = _pzem.getVoltage()
        current = _pzem.getCurrent()
        power = _pzem.getActivePower()
        energy = _pzem.getActiveEnergy()
        pf = _pzem.getPowerFactor()
        freq = _pzem.getFrequency()

        if voltage <= 0 or freq <= 0:
            return None

        return {
            "voltage": round(voltage, 1),
            "current": round(current, 3),
            "power": round(power, 1),
            "energy": energy,
            "power_factor": round(pf, 2),
            "frequency": round(freq, 1)
        }

    except Exception as e:
        print("[PZEM] Read error:", e)
        return None

