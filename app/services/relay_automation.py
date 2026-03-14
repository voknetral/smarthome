"""
Relay Automation Service
Background service for evaluating and executing relay automation rules
"""
import json
import time
import threading
from datetime import datetime, timezone, timedelta
from app.db.session import get_cursor
from app.utils import publish_mqtt_relay
from app.core.logging import logger

# Global event for triggering immediate automation evaluation
_trigger_event = threading.Event()

def trigger_relay_automation():
    """Trigger the automation service to evaluate rules immediately"""
    _trigger_event.set()


def get_current_day():
    """Get current day of week in short form (mon, tue, etc)"""
    days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    wib = timezone(timedelta(hours=7))
    now = datetime.now(wib)
    return days[now.weekday()]


def get_current_time():
    """Get current time in HH:MM format (WIB)"""
    wib = timezone(timedelta(hours=7))
    now = datetime.now(wib)
    return now.strftime("%H:%M")


def is_time_in_range(current_time, start_time, end_time):
    """Check if current time is within start and end time range.
    Handles overnight ranges (e.g., 18:00 to 06:00)"""
    current = datetime.strptime(current_time, "%H:%M").time()
    start = datetime.strptime(start_time, "%H:%M").time()
    end = datetime.strptime(end_time, "%H:%M").time()
    
    if start <= end:
        # Same day range (e.g., 08:00 to 17:00)
        return start <= current < end
    else:
        # Overnight range (e.g., 18:00 to 06:00)
        return current >= start or current < end


def evaluate_time_rules(relay_id, config):
    """Evaluate time-based automation rules for a relay.
    Returns: 'on', 'off', or None (no action)"""
    time_rules = config.get('time_rules', [])
    if not time_rules:
        return None
    
    current_day = get_current_day()
    current_time = get_current_time()
    
    for rule in time_rules:
        # Check if today is in the rule's active days
        if current_day not in rule.get('days', []):
            continue
        
        # Check if current time is within the rule's time range
        if is_time_in_range(current_time, rule.get('start_time'), rule.get('end_time')):
            action = rule.get('action', 'on')
            logger.debug(f"AUTOMATION | Relay {relay_id} | Time rule matched: {rule.get('id')} -> {action}")
            return action
    
    return None


def evaluate_sensor_rules(relay_id, config):
    """Evaluate sensor-based automation rules for a relay.
    Returns: 'on', 'off', or None (no action)"""
    sensor_rules = config.get('sensor_rules', [])
    if not sensor_rules:
        return None
    
    # Fetch latest sensor data
    wib = timezone(timedelta(hours=7))
    now = datetime.now(wib)
    max_age = 300 # 5 minutes in seconds
    
    try:
        sensor_data = {}  # Initialize sensor_data dictionary
        with get_cursor() as cur:

            # Helper to check if data is usable (not stale)
            def is_fresh(row):
                if not row or not row.get('timestamp'): return False
                
                # timestamps in DB are stored as naive but intended as WIB
                # we need to ensure they are treated as WIB for comparison
                ts = row['timestamp']
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=wib)
                
                age = (now - ts).total_seconds()
                return age < max_age

            # Fetch latest DHT22
            cur.execute("SELECT temperature, humidity, timestamp FROM data_dht22 ORDER BY timestamp DESC LIMIT 1")
            row = cur.fetchone()
            if is_fresh(row):
                sensor_data['dht22'] = {'temperature': row['temperature'], 'humidity': row['humidity']}
            elif row:
                logger.warning(f"AUTOMATION | DHT22 data is stale ({ (now - row['timestamp']).total_seconds():.0f}s old)")
            
            # Fetch latest MQ2
            cur.execute("SELECT gas_lpg, gas_co, smoke, timestamp FROM data_mq2 ORDER BY timestamp DESC LIMIT 1")
            row = cur.fetchone()
            if is_fresh(row):
                sensor_data['mq2'] = {'lpg': row['gas_lpg'], 'co': row['gas_co'], 'smoke': row['smoke']}
            elif row:
                logger.warning(f"AUTOMATION | MQ2 data is stale ({ (now - row['timestamp']).total_seconds():.0f}s old)")
            
            # Fetch latest PZEM
            cur.execute("SELECT voltage, current, power, energy, frequency, power_factor, timestamp FROM data_pzem004t ORDER BY timestamp DESC LIMIT 1")
            row = cur.fetchone()
            if is_fresh(row):
                sensor_data['pzem004t'] = {
                    'voltage': row['voltage'],
                    'current': row['current'],
                    'power': row['power'],
                    'energy': row['energy'],
                    'frequency': row['frequency'],
                    'power_factor': row['power_factor']
                }
            elif row:
                logger.warning(f"AUTOMATION | PZEM data is stale ({ (now - row['timestamp']).total_seconds():.0f}s old)")
            
            # Fetch latest BH1750
            cur.execute("SELECT lux, timestamp FROM data_bh1750 ORDER BY timestamp DESC LIMIT 1")
            row = cur.fetchone()
            if is_fresh(row):
                sensor_data['bh1750'] = {'lux': row['lux']}
            elif row:
                logger.warning(f"AUTOMATION | BH1750 data is stale ({ (now - row['timestamp']).total_seconds():.0f}s old)")
    except Exception as e:
        logger.error(f"AUTOMATION | Error fetching sensor data: {e}")
        return None
    
    # Evaluate each sensor rule
    for rule in sensor_rules:
        sensor = rule.get('sensor')
        metric = rule.get('metric')
        operator = rule.get('operator')
        threshold = float(rule.get('value', 0))
        action = rule.get('action', 'on')
        
        # Get sensor value
        if sensor not in sensor_data:
            continue
        
        current_value = sensor_data[sensor].get(metric)
        if current_value is None:
            continue
        
        current_value = float(current_value)
        
        # Evaluate operator
        matched = False
        if operator == '<':
            matched = current_value < threshold
        elif operator == '>':
            matched = current_value > threshold
        elif operator == '<=':
            matched = current_value <= threshold
        elif operator == '>=':
            matched = current_value >= threshold
        elif operator == '==':
            matched = abs(current_value - threshold) < 0.01
        
        if matched:
            logger.debug(f"AUTOMATION | Relay {relay_id} | Sensor rule matched: {sensor}.{metric} {operator} {threshold} (current: {current_value}) -> {action}")
            return action
    
    return None


def execute_relay_action(relay_id, action, reason="Automation"):
    """Execute relay action (turn on/off) and log to history"""
    is_active = (action.lower() == 'on')
    
    try:
        with get_cursor() as cur:
            # Get relay info
            cur.execute("SELECT name, gpio, is_active FROM status_relay WHERE id = %s", (relay_id,))
            relay = cur.fetchone()
            if not relay:
                logger.warning(f"AUTOMATION | Relay {relay_id} not found")
                return
            
            # Skip if relay is already in desired state
            if relay['is_active'] == is_active:
                logger.debug(f"AUTOMATION | Relay {relay_id} already in state: {action}")
                return
            
            # Update database
            cur.execute("UPDATE status_relay SET is_active = %s WHERE id = %s", (is_active, relay_id))
            
            # Publish to MQTT
            publish_mqtt_relay(relay['gpio'], is_active)
            
            # Log to history
            status_text = "ON" if is_active else "OFF"
            status_class = "text-green-600" if is_active else "text-slate-600"
            cur.execute(
                "INSERT INTO app_history (event, status, status_class) VALUES (%s, %s, %s)",
                (f"🤖 {relay['name']} automated {reason}", status_text, status_class)
            )
            
            logger.info(f"AUTOMATION | Relay {relay_id} ({relay['name']}) turned {action.upper()} - {reason}")
    except Exception as e:
        logger.error(f"AUTOMATION | Error executing action for relay {relay_id}: {e}")


def evaluate_and_execute_relay(relay_id, name, auto_config):
    """Evaluate and execute automation rules for a single relay"""
    config_type = auto_config.get('type', 'time')
    action = None
    
    if config_type == 'time':
        action = evaluate_time_rules(relay_id, auto_config)
    elif config_type == 'sensor':
        action = evaluate_sensor_rules(relay_id, auto_config)
    elif config_type == 'combined':
        # Combined: Both time AND sensor rules must match
        time_action = evaluate_time_rules(relay_id, auto_config)
        sensor_action = evaluate_sensor_rules(relay_id, auto_config)
        
        # If both return the same action, execute it
        if time_action and sensor_action and time_action == sensor_action:
            action = time_action

    # FALLBACK: If no rules match, determine the opposite action
    if action is None:
        # Collect all rules to find the intended "trigger" action
        all_rules = auto_config.get('time_rules', []) + auto_config.get('sensor_rules', [])
        if all_rules:
            # If any rule is defined, we assume a non-match should trigger the opposite state.
            # Typically, if matched is 'on', non-matched is 'off'.
            # This ensures the "Selesai" time actually turns off the relay.
            first_rule_action = all_rules[0].get('action', 'on')
            action = 'off' if first_rule_action == 'on' else 'on'
    
    # Execute action if determined
    if action:
        execute_relay_action(relay_id, action, reason=f"{config_type.capitalize()} rule")


def automation_loop(stop_event):
    """Main automation loop - runs on trigger or every 30 seconds (fallback)"""
    logger.info("AUTOMATION | Service started")
    
    while not stop_event.is_set():
        try:
            # Clear trigger event at start of loop
            _trigger_event.clear()
            
            # Fetch all relays in auto mode
            with get_cursor() as cur:
                cur.execute("SELECT id, name, mode, auto_config FROM status_relay WHERE mode = 'auto'")
                relays = cur.fetchall()
            
            for relay in relays:
                evaluate_and_execute_relay(relay['id'], relay['name'], relay['auto_config'])
        
        except Exception as e:
            logger.error(f"AUTOMATION | Loop error: {e}")
        
        # Wait until triggered or timeout (fallback 30s)
        # Using a shorter timeout for better responsiveness if no trigger occurs
        _trigger_event.wait(30)
    
    logger.info("AUTOMATION | Service stopped")


def start_automation_service(stop_event):
    """Start automation service"""
    automation_loop(stop_event)
