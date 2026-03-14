# ==============================================
# Threshold Checker Service
# ==============================================
# Check sensor data terhadap threshold dan trigger alerts

from app.services.telegram import send_telegram_notification
from app.services.alert_formatter import AlertFormatter
from app.db.session import get_cursor
import asyncio
import logging
import time

logger = logging.getLogger("ThresholdChecker")


class ThresholdChecker:
    """Check sensor values against thresholds dan generate formatted alerts"""
    
    # Store last alert time to implement cooldown
    # Key format: "sensor_type:condition", Value: timestamp
    _last_alert_time = {}
    # Key format: "sensor_type:condition", Value: timestamp
    _last_alert_time = {}
    
    @staticmethod
    async def check_and_alert(sensor_type, data, thresholds, enable_thresholds=True, alert_cooldown=300):

        """
        Check sensor data against thresholds
        
        Args:
            sensor_type: "dht22" | "pzem004t" | "mq2" | "bh1750"
            data: Sensor data dict
            thresholds: Threshold config dict
            enable_thresholds: Whether threshold checking is enabled
        
        Returns:
            List of alerts generated
        """
        alerts = []
        
        if not enable_thresholds:
            return alerts
        
        if sensor_type == "dht22":
            alerts.extend(ThresholdChecker._check_dht22(data, thresholds))
        elif sensor_type == "pzem004t":
            alerts.extend(ThresholdChecker._check_pzem(data, thresholds))
        elif sensor_type == "mq2":
            alerts.extend(ThresholdChecker._check_mq2(data, thresholds))
        elif sensor_type == "bh1750":
            alerts.extend(ThresholdChecker._check_bh1750(data, thresholds))
        
        # Process alerts (save to history and send Telegram)
        for alert in alerts:
            await ThresholdChecker._process_alert(alert, alert_cooldown)
        
        return alerts
    
    @staticmethod
    def _check_dht22(data, thresholds):
        """Check DHT22 temperature and humidity"""
        alerts = []
        config = thresholds.get("dht22", {})
        
        temp = data.get("temperature") or data.get("temp")
        hum = data.get("humidity") or data.get("hum")
        
        if temp is not None:
            temp_val = float(temp)
            temp_max = config.get("tempMax")
            temp_min = config.get("tempMin")
            
            if temp_max and temp_val > temp_max:
                alert = AlertFormatter.format_dht22_alert(
                    "temp_high", round(temp_val, 1), temp_max, "critical"
                )
                alerts.append(alert)
            elif temp_min and temp_val < temp_min:
                alert = AlertFormatter.format_dht22_alert(
                    "temp_low", round(temp_val, 1), temp_min, "warning"
                )
                alerts.append(alert)
        
        if hum is not None:
            hum_val = float(hum)
            hum_max = config.get("humMax")
            hum_min = config.get("humMin")
            
            if hum_max and hum_val > hum_max:
                alert = AlertFormatter.format_dht22_alert(
                    "hum_high", round(hum_val, 1), hum_max, "warning"
                )
                alerts.append(alert)
            elif hum_min and hum_val < hum_min:
                alert = AlertFormatter.format_dht22_alert(
                    "hum_low", round(hum_val, 1), hum_min, "warning"
                )
                alerts.append(alert)
        
        return alerts
    
    @staticmethod
    def _check_pzem(data, thresholds):
        """Check PZEM004T electrical parameters"""
        alerts = []
        config = thresholds.get("pzem004t", {})
        
        # Check voltage
        voltage = data.get("voltage")
        if voltage is not None:
            voltage_val = float(voltage)
            v_max = config.get("voltageMax")
            v_min = config.get("voltageMin")
            
            if v_max and voltage_val > v_max:
                alert = AlertFormatter.format_pzem_alert(
                    "voltage_high", round(voltage_val, 1), v_max, "warning"
                )
                alerts.append(alert)
            elif v_min and voltage_val < v_min:
                alert = AlertFormatter.format_pzem_alert(
                    "voltage_low", round(voltage_val, 1), v_min, "critical"
                )
                alerts.append(alert)
        
        # Check current
        current = data.get("current")
        if current is not None:
            current_val = float(current)
            i_max = config.get("currentMax")
            
            if i_max and current_val > i_max:
                alert = AlertFormatter.format_pzem_alert(
                    "current_high", round(current_val, 2), i_max, "warning"
                )
                alerts.append(alert)
        
        # Check power
        power = data.get("power")
        if power is not None:
            power_val = float(power)
            p_max = config.get("powerMax")
            
            if p_max and power_val > p_max:
                alert = AlertFormatter.format_pzem_alert(
                    "power_high", int(power_val), p_max, "warning"
                )
                alerts.append(alert)
        
        # Check energy
        energy = data.get("energy")
        if energy is not None:
            energy_val = float(energy)
            e_max = config.get("energyMax")
            
            if e_max and energy_val > e_max:
                alert = AlertFormatter.format_pzem_alert(
                    "energy_high", round(energy_val, 2), e_max, "warning"
                )
                alerts.append(alert)
        
        # Check power factor (MOST IMPORTANT)
        pf = data.get("power_factor")
        if pf is not None:
            pf_val = float(pf)
            pf_min = config.get("pfMin")
            
            if pf_min and pf_val < pf_min:
                alert = AlertFormatter.format_pzem_alert(
                    "pf_low", round(pf_val, 2), pf_min, "warning"
                )
                alerts.append(alert)
        
        # Check frequency
        freq = data.get("frequency")
        if freq is not None:
            freq_val = float(freq)
            f_max = config.get("freqMax")
            f_min = config.get("freqMin")
            
            if f_max and freq_val > f_max:
                alert = AlertFormatter.format_pzem_alert(
                    "freq_high", round(freq_val, 1), f_max, "warning"
                )
                alerts.append(alert)
            elif f_min and freq_val < f_min:
                alert = AlertFormatter.format_pzem_alert(
                    "freq_low", round(freq_val, 1), f_min, "warning"
                )
                alerts.append(alert)
        
        return alerts
    
    @staticmethod
    def _check_mq2(data, thresholds):
        """Check MQ2 gas concentrations"""
        alerts = []
        config = thresholds.get("mq2", {})
        
        # Check smoke
        smoke = data.get("smoke") or data.get("Smoke")
        if smoke is not None:
            smoke_val = float(smoke)
            smoke_max = config.get("smokeMax")
            smoke_warn = config.get("smokeWarn")
            
            if smoke_max and smoke_val > smoke_max:
                alert = AlertFormatter.format_mq2_alert(
                    "smoke", int(smoke_val), smoke_max, "critical"
                )
                alerts.append(alert)
            elif smoke_warn and smoke_val > smoke_warn:
                alert = AlertFormatter.format_mq2_alert(
                    "smoke", int(smoke_val), smoke_warn, "warning"
                )
                alerts.append(alert)
        
        # Check LPG
        lpg = data.get("lpg") or data.get("gas_lpg") or data.get("LPG")
        if lpg is not None:
            lpg_val = float(lpg)
            lpg_max = config.get("lpgMax")
            lpg_warn = config.get("lpgWarn")
            
            if lpg_max and lpg_val > lpg_max:
                alert = AlertFormatter.format_mq2_alert(
                    "lpg", int(lpg_val), lpg_max, "critical"
                )
                alerts.append(alert)
            elif lpg_warn and lpg_val > lpg_warn:
                alert = AlertFormatter.format_mq2_alert(
                    "lpg", int(lpg_val), lpg_warn, "warning"
                )
                alerts.append(alert)
        
        # Check CO
        co = data.get("co") or data.get("gas_co") or data.get("CO")
        if co is not None:
            co_val = float(co)
            co_max = config.get("coMax")
            co_warn = config.get("coWarn")
            
            if co_max and co_val > co_max:
                alert = AlertFormatter.format_mq2_alert(
                    "co", int(co_val), co_max, "critical"
                )
                alerts.append(alert)
            elif co_warn and co_val > co_warn:
                alert = AlertFormatter.format_mq2_alert(
                    "co", int(co_val), co_warn, "warning"
                )
                alerts.append(alert)
        
        return alerts
    
    @staticmethod
    def _check_bh1750(data, thresholds):
        """Check BH1750 light intensity"""
        alerts = []
        config = thresholds.get("bh1750", {})
        
        lux = data.get("lux")
        if lux is not None:
            lux_val = float(lux)
            lux_max = config.get("luxMax")
            lux_min = config.get("luxMin")
            
            if lux_max and lux_val > lux_max:
                alert = AlertFormatter.format_bh1750_alert(
                    "lux_high", int(lux_val), lux_max, "warning"
                )
                alerts.append(alert)
            elif lux_min and lux_val < lux_min:
                alert = AlertFormatter.format_bh1750_alert(
                    "lux_low", int(lux_val), lux_min, "info"
                )
                alerts.append(alert)
        
        return alerts
    
    @staticmethod
    async def _process_alert(alert, alert_cooldown=300):
        """Process alert - save to history, send Telegram notification"""
        try:
            sensor = alert.get("sensor", "unknown")
            condition = alert.get("condition", "Alert")
            alert_type = alert.get("type", "warning")
            
            # --- COOLDOWN CHECK ---
            alert_key = f"{sensor}:{condition}"
            now = time.time()
            last_hit = ThresholdChecker._last_alert_time.get(alert_key, 0)
            
            if now - last_hit < alert_cooldown:
                # Still in cooldown, skip this alert
                return
            
            # Update last alert time
            ThresholdChecker._last_alert_time[alert_key] = now
            # ----------------------

            # Map alert type to status
            status_map = {
                "critical": ("🚨 CRITICAL", "text-red-600"),
                "warning": ("⚠️ WARNING", "text-orange-500"),
                "info": ("ℹ️ INFO", "text-blue-500"),
                "ok": ("✅ OK", "text-green-600")
            }
            status, status_class = status_map.get(alert_type, ("Alert", "text-slate-600"))
            event_text = f"{condition} ({sensor.upper()})"

            # Offload DB saving to thread to avoid blocking loop
            def save_to_db():
                with get_cursor() as cur:
                    cur.execute(
                        "INSERT INTO app_history (event, status, status_class) VALUES (%s, %s, %s)",
                        (event_text, status, status_class)
                    )
            
            await asyncio.to_thread(save_to_db)
            
            # Use the pre-formatted message from AlertFormatter if available
            telegram_msg = alert.get("message")
            
            if not telegram_msg:
                # Fallback (should not happen with current AlertFormatter)
                from datetime import datetime
                time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                emoji = "🚨" if alert_type == "critical" else "⚠️"
                telegram_msg = (
                    f"{emoji} *ALERT: {sensor.upper()}*\n"
                    f"━━━━━━━━━━━━━━━━━━━━\n"
                    f"📌 Kondisi: *{condition}*\n"
                    f"━━━━━━━━━━━━━━━━━━━━\n"
                    f"🕒 _{time_str}_"
                )
            
            logger.info(f"Sending Telegram notification for {sensor}...")
            success = await send_telegram_notification(telegram_msg)
            
            if success:
                logger.info(f"Alert processed and sent: {condition} [{sensor}]")
            else:
                logger.error(f"Alert processed but Telegram FAILED: {condition} [{sensor}]")
        
        except Exception as e:
            logger.error(f"Failed to process alert: {e}")
