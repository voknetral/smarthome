# ==============================================
# NUSAHOME - MQ-2 Gas Sensor Module
# ==============================================

from machine import ADC, Pin
import time
import math
import json
from config import MQ2_PIN


# ------------------------------------------------
# Constants
# ------------------------------------------------
RL_VALUE = 5.0
RO_CLEAN_AIR_FACTOR = 9.83

ADC_MAX = 65535
VREF = 3.3

CALIBRATION_SAMPLE_TIMES = 50
CALIBRATION_SAMPLE_INTERVAL = 0.1

READ_SAMPLE_TIMES = 5
READ_SAMPLE_INTERVAL = 0.05

LPG_CURVE   = [2.3, 0.21, -0.47]
CO_CURVE    = [2.3, 0.72, -0.34]
SMOKE_CURVE = [2.3, 0.53, -0.44]

GAS_LPG   = 0
GAS_CO    = 1
GAS_SMOKE = 2

RO_FILE = "mq2_ro.json"

EMA_ALPHA = 0.3

PPM_MIN = 0
PPM_MAX = 10000


# ------------------------------------------------
# Ro Persistence
# ------------------------------------------------
def save_ro(ro):
    try:
        with open(RO_FILE, "w") as f:
            json.dump({"ro": ro}, f)
        print(f"[MQ2] Ro saved: {ro:.2f} kΩ")
    except Exception as e:
        print("[MQ2] Save Ro error:", e)


def load_ro():
    try:
        with open(RO_FILE, "r") as f:
            data = json.load(f)
            ro = data.get("ro")
            if ro:
                print(f"[MQ2] Ro loaded: {ro:.2f} kΩ")
                return ro
    except:
        pass

    return None


# ------------------------------------------------
# MQ2 Class
# ------------------------------------------------
class MQ2:
    def __init__(self, adc_pin):
        self.adc = ADC(Pin(adc_pin))
        self.ro = load_ro()
        self._ema_rs = None

    def _read_voltage(self):
        return (self.adc.read_u16() / ADC_MAX) * VREF

    def _rs_from_voltage(self, v):
        if v <= 0:
            return float("inf")
        return RL_VALUE * (VREF - v) / v

    def calibrate(self):
        print("🔥 [MQ2] Calibration (clean air)")
        print("⚠ Warm-up sensor ≥ 5 minutes")

        rs_sum = 0

        for _ in range(CALIBRATION_SAMPLE_TIMES):
            v = self._read_voltage()
            rs_sum += self._rs_from_voltage(v)
            time.sleep(CALIBRATION_SAMPLE_INTERVAL)

        rs_avg = rs_sum / CALIBRATION_SAMPLE_TIMES
        self.ro = rs_avg / RO_CLEAN_AIR_FACTOR

        save_ro(self.ro)

        print(f"✅ [MQ2] Calibration done | Ro = {self.ro:.2f} kΩ")
        return self.ro

    def read_rs(self):
        rs_sum = 0

        for _ in range(READ_SAMPLE_TIMES):
            v = self._read_voltage()
            rs_sum += self._rs_from_voltage(v)
            time.sleep(READ_SAMPLE_INTERVAL)

        rs = rs_sum / READ_SAMPLE_TIMES

        if self._ema_rs is None:
            self._ema_rs = rs
        else:
            self._ema_rs = (EMA_ALPHA * rs) + ((1 - EMA_ALPHA) * self._ema_rs)

        return self._ema_rs

    def get_ppm(self, gas_type, rs):
        if not self.ro or self.ro <= 0:
            return 0

        ratio = rs / self.ro
        ratio = max(0.01, min(ratio, 100))

        if gas_type == GAS_LPG:
            curve = LPG_CURVE
        elif gas_type == GAS_CO:
            curve = CO_CURVE
        elif gas_type == GAS_SMOKE:
            curve = SMOKE_CURVE
        else:
            return 0

        return self._curve_calc(ratio, curve)

    def _curve_calc(self, ratio, curve):
        try:
            ppm = pow(
                10,
                ((math.log10(ratio) - curve[1]) / curve[2]) + curve[0]
            )
            return min(max(ppm, PPM_MIN), PPM_MAX)
        except:
            return 0


# ------------------------------------------------
# Module API
# ------------------------------------------------
_sensor = None


def init():
    global _sensor

    try:
        _sensor = MQ2(MQ2_PIN)

        if _sensor.ro is None:
            print("[MQ2] No calibration found")
            _sensor.calibrate()
        else:
            print(f"[MQ2] Using saved Ro: {_sensor.ro:.2f} kΩ")

    except Exception as e:
        print("[MQ2] Init error:", e)
        _sensor = None


def read():
    if not _sensor or _sensor.ro is None:
        return None

    try:
        rs = _sensor.read_rs()
        ratio = rs / _sensor.ro

        return {
            "lpg": round(_sensor.get_ppm(GAS_LPG, rs), 1),
            "co": round(_sensor.get_ppm(GAS_CO, rs), 1),
            "smoke": round(_sensor.get_ppm(GAS_SMOKE, rs), 1),
            "rs_ro_ratio": round(ratio, 3),
            "calibrated": True
        }

    except Exception as e:
        print("[MQ2] Read error:", e)
        return None

