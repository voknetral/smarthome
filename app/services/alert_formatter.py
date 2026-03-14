# ==============================================
# Alert Formatter Service
# ==============================================
# Menyediakan format alert yang konsisten dan rapi untuk semua sensor

from datetime import datetime, timezone, timedelta
import json


class AlertFormatter:
    """Format alert messages untuk berbagai sensor dengan style yang konsisten dan rapi"""
    
    # WIB timezone (UTC+7)
    WIB = timezone(timedelta(hours=7))
    
    # Severity levels dengan emoji dan warna
    SEVERITY = {
        "critical": {"emoji": "🚨", "color": "text-red-600", "label": "CRITICAL"},
        "warning": {"emoji": "⚠️", "color": "text-orange-500", "label": "WARNING"},
        "info": {"emoji": "ℹ️", "color": "text-blue-500", "label": "INFO"},
        "ok": {"emoji": "✅", "color": "text-green-600", "label": "OK"}
    }
    
    # Sensor names dan icons
    SENSORS = {
        "dht22": {"name": "DHT22 (Suhu & Kelembaban)", "icon": "🌡️", "color": "blue"},
        "pzem004t": {"name": "PZEM004T (Monitor Listrik)", "icon": "⚡", "color": "yellow"},
        "mq2": {"name": "MQ2 (Kualitas Udara)", "icon": "💨", "color": "orange"},
        "bh1750": {"name": "BH1750 (Cahaya)", "icon": "💡", "color": "amber"}
    }

    @staticmethod
    def get_timestamp():
        """Get formatted timestamp in WIB timezone"""
        now = datetime.now(AlertFormatter.WIB)
        return now.strftime("%d/%m/%Y, %H:%M:%S")

    @classmethod
    def format_dht22_alert(cls, condition, value, threshold, severity="warning"):
        """Format DHT22 alert
        
        Args:
            condition: "temp_high" | "temp_low" | "hum_high" | "hum_low"
            value: Current value
            threshold: Threshold value
            severity: "warning" | "critical"
        """
        sensor_info = cls.SENSORS["dht22"]
        sev = cls.SEVERITY.get(severity, cls.SEVERITY["warning"])
        
        condition_map = {
            "temp_high": ("Suhu Terlalu Tinggi", f"{value}°C", f"≤ {threshold}°C"),
            "temp_low": ("Suhu Terlalu Rendah", f"{value}°C", f"≥ {threshold}°C"),
            "hum_high": ("Kelembaban Terlalu Tinggi", f"{value}%", f"≤ {threshold}%"),
            "hum_low": ("Kelembaban Terlalu Rendah", f"{value}%", f"≥ {threshold}%")
        }
        
        cond_name, current, limit = condition_map.get(condition, ("Unknown", str(value), str(threshold)))
        
        message = (
            f"{sev['emoji']} *{sensor_info['name']}*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"📌 Status: {cond_name}\n"
            f"📊 Nilai Saat Ini: `{current}`\n"
            f"⚠️  Batas: `{limit}`\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🕒 {cls.get_timestamp()}"
        )
        
        return {
            "message": message,
            "type": severity,
            "sensor": "dht22",
            "icon": sensor_info["icon"],
            "condition": cond_name
        }

    @classmethod
    def format_pzem_alert(cls, metric, value, threshold, severity="warning"):
        """Format PZEM004T alert
        
        Args:
            metric: "voltage_high" | "voltage_low" | "current_high" | "power_high" | 
                   "energy_high" | "pf_low" | "freq_high" | "freq_low"
            value: Current value
            threshold: Threshold value
            severity: "warning" | "critical"
        """
        sensor_info = cls.SENSORS["pzem004t"]
        sev = cls.SEVERITY.get(severity, cls.SEVERITY["warning"])
        
        metric_map = {
            "voltage_high": ("Tegangan Terlalu Tinggi", f"{value} V", f"≤ {threshold} V"),
            "voltage_low": ("Tegangan Terlalu Rendah", f"{value} V", f"≥ {threshold} V"),
            "current_high": ("Arus Terlalu Tinggi", f"{value} A", f"≤ {threshold} A"),
            "power_high": ("Daya Terlalu Tinggi", f"{value} W", f"≤ {threshold} W"),
            "energy_high": ("Energi Melebihi Batas", f"{value} kWh", f"≤ {threshold} kWh"),
            "pf_low": ("Power Factor Rendah", f"{value}", f"≥ {threshold}"),
            "freq_high": ("Frekuensi Terlalu Tinggi", f"{value} Hz", f"≤ {threshold} Hz"),
            "freq_low": ("Frekuensi Terlalu Rendah", f"{value} Hz", f"≥ {threshold} Hz")
        }
        
        metric_name, current, limit = metric_map.get(metric, ("Unknown", str(value), str(threshold)))
        
        message = (
            f"{sev['emoji']} *{sensor_info['name']}*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"📌 Kondisi: {metric_name}\n"
            f"📊 Nilai: `{current}`\n"
            f"⚠️  Batas: `{limit}`\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🕒 {cls.get_timestamp()}"
        )
        
        return {
            "message": message,
            "type": severity,
            "sensor": "pzem004t",
            "icon": sensor_info["icon"],
            "condition": metric_name
        }

    @classmethod
    def format_mq2_alert(cls, gas_type, value, threshold, severity="warning"):
        """Format MQ2 alert
        
        Args:
            gas_type: "smoke" | "lpg" | "co"
            value: Current value
            threshold: Threshold value
            severity: "warning" | "critical"
        """
        sensor_info = cls.SENSORS["mq2"]
        sev = cls.SEVERITY.get(severity, cls.SEVERITY["warning"])
        
        gas_map = {
            "smoke": ("Asap", "ppm"),
            "lpg": ("Gas LPG", "ppm"),
            "co": ("Gas CO", "ppm")
        }
        
        gas_name, unit = gas_map.get(gas_type, ("Unknown", ""))
        
        message = (
            f"{sev['emoji']} *{sensor_info['name']}*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"📌 Gas: {gas_name}\n"
            f"📊 Nilai: `{value} {unit}`\n"
            f"⚠️  Batas: `{threshold} {unit}`\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🕒 {cls.get_timestamp()}"
        )
        
        return {
            "message": message,
            "type": severity,
            "sensor": "mq2",
            "icon": sensor_info["icon"],
            "condition": gas_name
        }

    @classmethod
    def format_bh1750_alert(cls, condition, value, threshold, severity="warning"):
        """Format BH1750 alert
        
        Args:
            condition: "lux_high" | "lux_low"
            value: Current value
            threshold: Threshold value
            severity: "warning" | "critical"
        """
        sensor_info = cls.SENSORS["bh1750"]
        sev = cls.SEVERITY.get(severity, cls.SEVERITY["warning"])
        
        condition_map = {
            "lux_high": ("Cahaya Terlalu Terang", f"{value} lux", f"≤ {threshold} lux"),
            "lux_low": ("Cahaya Terlalu Gelap", f"{value} lux", f"≥ {threshold} lux")
        }
        
        cond_name, current, limit = condition_map.get(condition, ("Unknown", str(value), str(threshold)))
        
        message = (
            f"{sev['emoji']} *{sensor_info['name']}*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"📌 Status: {cond_name}\n"
            f"📊 Nilai: `{current}`\n"
            f"⚠️  Batas: `{limit}`\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🕒 {cls.get_timestamp()}"
        )
        
        return {
            "message": message,
            "type": severity,
            "sensor": "bh1750",
            "icon": sensor_info["icon"],
            "condition": cond_name
        }

    @classmethod
    def format_device_status(cls, device_id, status, details=""):
        """Format device status alert
        
        Args:
            device_id: Device identifier (e.g., "PICO-W")
            status: "online" | "offline" | "error" | "booting"
            details: Additional details
        """
        status_map = {
            "online": ("Perangkat Online", cls.SEVERITY["ok"]),
            "offline": ("Perangkat Offline", cls.SEVERITY["critical"]),
            "error": ("Error Detected", cls.SEVERITY["warning"]),
            "booting": ("Booting...", cls.SEVERITY["info"])
        }
        
        status_name, sev = status_map.get(status, ("Unknown", cls.SEVERITY["info"]))
        
        detail_line = f"📝 Detail: {details}\n" if details else ""
        
        message = (
            f"{sev['emoji']} *Device Status - {device_id}*\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"📌 Status: {status_name}\n"
            f"{detail_line}"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🕒 {cls.get_timestamp()}"
        )
        
        return {
            "message": message,
            "type": status,
            "device": device_id,
            "condition": status_name
        }


# Export untuk kemudahan penggunaan
def format_alert(sensor_type, **kwargs):
    """Generic alert formatter
    
    Usage:
        format_alert("pzem004t", metric="pf_low", value=0.66, threshold=0.7, severity="warning")
        format_alert("dht22", condition="temp_high", value=35, threshold=30, severity="warning")
    """
    if sensor_type == "pzem004t":
        return AlertFormatter.format_pzem_alert(
            kwargs.get("metric"),
            kwargs.get("value"),
            kwargs.get("threshold"),
            kwargs.get("severity", "warning")
        )
    elif sensor_type == "dht22":
        return AlertFormatter.format_dht22_alert(
            kwargs.get("condition"),
            kwargs.get("value"),
            kwargs.get("threshold"),
            kwargs.get("severity", "warning")
        )
    elif sensor_type == "mq2":
        return AlertFormatter.format_mq2_alert(
            kwargs.get("gas_type"),
            kwargs.get("value"),
            kwargs.get("threshold"),
            kwargs.get("severity", "warning")
        )
    elif sensor_type == "bh1750":
        return AlertFormatter.format_bh1750_alert(
            kwargs.get("condition"),
            kwargs.get("value"),
            kwargs.get("threshold"),
            kwargs.get("severity", "warning")
        )
    elif sensor_type == "device":
        return AlertFormatter.format_device_status(
            kwargs.get("device_id", "Unknown"),
            kwargs.get("status", "unknown"),
            kwargs.get("details", "")
        )
    
    return {"message": "Invalid sensor type", "type": "error"}
