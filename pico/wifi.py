# ==============================================
# NUSAHOME - WiFi Module
# ==============================================

import network
import time
from config import WIFI_SSID, WIFI_PASS

wlan = network.WLAN(network.STA_IF)


def connect(timeout: int = 30) -> bool:
    print("=" * 40)

    if wlan.isconnected():
        ip = wlan.ifconfig()[0]
        print("WiFi already connected ✔")
        print(f"  SSID : {WIFI_SSID}")
        print(f"  IP   : {ip}")
        print("=" * 40)
        return True

    print("Connecting to WiFi...", end="")

    try:
        wlan.active(True)
        wlan.connect(WIFI_SSID, WIFI_PASS)

        while not wlan.isconnected() and timeout > 0:
            print(".", end="")
            time.sleep(1)
            timeout -= 1

        if not wlan.isconnected():
            print("\n❌ WiFi connection failed!")
            print("=" * 40)
            return False

        ip = wlan.ifconfig()[0]
        print("\n✔ Connected!")
        print(f"  SSID : {WIFI_SSID}")
        print(f"  IP   : {ip}")
        print("=" * 40)
        return True

    except Exception as err:
        print("\n❌ WiFi error:", err)
        print("=" * 40)
        return False


def is_connected() -> bool:
    return wlan.isconnected()


def reconnect(timeout: int = 30) -> bool:
    if not wlan.isconnected():
        print("⚠ WiFi lost! Reconnecting...")
        return connect(timeout)
    return True


def get_ip():
    if wlan.isconnected():
        return wlan.ifconfig()[0]
    return None

