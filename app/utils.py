import json
import hashlib
import random
import time
import sys
from datetime import datetime, timedelta
import paho.mqtt.client as mqtt
from fastapi import HTTPException
from app.db.session import get_cursor
from app.core.config import settings
from app.core.logging import logger
from app.services.mqtt_manager import mqtt_manager
import bcrypt
from jose import JWTError, jwt

# Mapping sensor → nama tabel (hanya nama yang valid, mencegah SQL injection)
TABLES = {
    "dht22": "data_dht22",
    "mq2": "data_mq2",
    "pzem004t": "data_pzem004t",
    "bh1750": "data_bh1750"
}

# Mapping kolom per sensor (Updated to match DB schema)
COLUMNS = {
    "dht22": ["timestamp", "id", "temperature", "humidity"],
    "mq2": ["timestamp", "id", "gas_lpg", "gas_co", "smoke"],
    "pzem004t": ["timestamp", "id", "voltage", "current", "power", "energy", "frequency", "power_factor"],
    "bh1750": ["timestamp", "id", "lux"]
}

# Range waktu dengan interval sampling optimal (Smoother resolution)
RANGES = {
    "1h": {"delta": timedelta(hours=1), "interval": "1 minute"},      # 60 points
    "6h": {"delta": timedelta(hours=6), "interval": "5 minutes"},     # 72 points
    "12h": {"delta": timedelta(hours=12), "interval": "10 minutes"},  # 72 points
    "24h": {"delta": timedelta(hours=24), "interval": "20 minutes"},  # 72 points
    "7d": {"delta": timedelta(days=7), "interval": "3 hours"},       # 56 points
}

# Default threshold settings
DEFAULT_THRESHOLDS = {
    "dht22": {"tempMax": 35, "tempMin": 15, "humMax": 80, "humMin": 30},
    "mq2": {"smokeMax": 500, "smokeWarn": 350, "lpgMax": 1000, "lpgWarn": 500, "coMax": 500, "coWarn": 200},
    "pzem004t": {"powerMax": 2000, "voltageMin": 200, "voltageMax": 240, "currentMax": 9, "energyMax": 100, "pfMin": 0.7, "freqMin": 49, "freqMax": 51},
    "bh1750": {"luxMax": 100000, "luxMin": 0}
}

# Default MQTT settings
DEFAULT_MQTT_SETTINGS = {
    "host": "broker.hivemq.com",
    "port": 1883,
    "ws_port": 8884,
    "useSSL": True,
    "updateInterval": 5
}


def _truncate_password_bytes(password: str, max_bytes: int = 72) -> str:
    """Safely truncate password string to max_bytes when encoded as UTF-8."""
    if not isinstance(password, str):
        return password
    
    encoded = password.encode('utf-8')
    if len(encoded) <= max_bytes:
        return password
    
    # Truncate bytes and decode safely
    truncated = encoded[:max_bytes]
    while truncated:
        try:
            return truncated.decode('utf-8')
        except UnicodeDecodeError:
            truncated = truncated[:-1]
    
    return ""


def hash_password(password: str) -> str:
    """Hash password using BCrypt (truncated to 72 bytes for BCrypt limit)"""
    try:
        # Ensure password is truncated to 72 bytes at UTF-8 level
        truncated_pw = _truncate_password_bytes(password, 72)
        
        # Verify final byte length before hashing
        pw_bytes = truncated_pw.encode('utf-8')
        if len(pw_bytes) > 72:
            # Extra safety: truncate again if somehow still over limit
            truncated_pw = _truncate_password_bytes(truncated_pw, 72)
            pw_bytes = truncated_pw.encode('utf-8')
        
        # Use bcrypt directly
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(pw_bytes, salt)
        return hashed.decode('utf-8')
    except Exception as e:
        logger.error(f"Password hashing error: {e}")
        raise ValueError(f"Password hashing failed: {e}")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against BCrypt hash (truncated to 72 bytes)"""
    try:
        # Ensure password is truncated to 72 bytes at UTF-8 level
        truncated_pw = _truncate_password_bytes(plain_password, 72)
        pw_bytes = truncated_pw.encode('utf-8')
        
        # Handle both string and bytes hashes
        if isinstance(hashed_password, str):
            hashed_password = hashed_password.encode('utf-8')
        
        return bcrypt.checkpw(pw_bytes, hashed_password)
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False


def create_access_token(data: dict, expires_delta: timedelta = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def validate_sensor(sensor: str):
    """Validasi nama sensor dan return nama tabel yang aman"""
    if sensor not in TABLES:
        raise HTTPException(400, f"Sensor '{sensor}' tidak dikenal. Sensor yang tersedia: {list(TABLES.keys())}")
    return TABLES[sensor], COLUMNS[sensor]


def init_db():
    """Inisialisasi database dan tabel users jika belum ada"""
    try:
        with get_cursor() as cur:
            # Create users table if not exists
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'user',
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT NOW()
                );
            """)
            
            # Check for missing columns (migration for existing tables)
            cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='users'")
            columns = [row['column_name'] for row in cur.fetchall()]
            
            if 'is_active' not in columns:
                cur.execute("ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT true")
            if 'created_at' not in columns:
                cur.execute("ALTER TABLE users ADD COLUMN created_at TIMESTAMP DEFAULT NOW()")
            if 'force_password_change' not in columns:
                cur.execute("ALTER TABLE users ADD COLUMN force_password_change BOOLEAN DEFAULT false")
            if 'avatar_url' not in columns:
                cur.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT NULL")
            if 'last_active' not in columns:
                cur.execute("ALTER TABLE users ADD COLUMN last_active TIMESTAMP DEFAULT NOW()")
                
            logger.info("Database initialized successfully.")
            logger.debug("Creating status_relay table...")
            # Create status_relay table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS status_relay (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT DEFAULT NULL,
                    gpio INT,
                    is_active BOOLEAN DEFAULT false,
                    mode VARCHAR(10) DEFAULT 'manual',
                    auto_config JSONB DEFAULT '{}'::jsonb
                );
            """)

            # Check for missing columns in status_relay (migration)
            cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='status_relay'")
            relay_columns = [row['column_name'] for row in cur.fetchall()]
            
            if 'description' not in relay_columns:
                logger.info("Migrating status_relay: adding description column...")
                cur.execute("ALTER TABLE status_relay ADD COLUMN description TEXT DEFAULT NULL")
            
            if 'mode' not in relay_columns:
                logger.info("Migrating status_relay: adding mode column...")
                cur.execute("ALTER TABLE status_relay ADD COLUMN mode VARCHAR(10) DEFAULT 'manual'")
            
            if 'auto_config' not in relay_columns:
                logger.info("Migrating status_relay: adding auto_config column...")
                cur.execute("ALTER TABLE status_relay ADD COLUMN auto_config JSONB DEFAULT '{}'::jsonb")
            
            cur.execute("""
                CREATE TABLE IF NOT EXISTS app_history (
                    id SERIAL PRIMARY KEY,
                    event TEXT NOT NULL,
                    status TEXT NOT NULL,
                    status_class TEXT,
                    timestamp TIMESTAMP DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_history_timestamp ON app_history (timestamp DESC);
            """)

            # Create settings table for threshold configurations
            cur.execute("""
                CREATE TABLE IF NOT EXISTS app_settings (
                    id SERIAL PRIMARY KEY,
                    setting_key TEXT UNIQUE NOT NULL,
                    setting_value JSONB NOT NULL,
                    updated_at TIMESTAMP DEFAULT NOW()
                );
            """)
            
            # Check defaults for status_relay
            logger.debug("Checking status_relay defaults...")
            cur.execute("SELECT COUNT(*) as count FROM status_relay")
            if cur.fetchone()['count'] == 0:
                 logger.info("Seeding default status_relay...")
                 cur.execute("""
                    INSERT INTO status_relay (id, name, gpio, is_active) VALUES 
                    (1, 'Lampu Teras', 10, false),
                    (2, 'Pompa Air', 11, false),
                    (3, 'Exhaust Fan', 12, false),
                    (4, 'Door Lock', 13, false)
                 """)
            
            # Check defaults for app_settings (thresholds)
            logger.debug("Checking threshold settings...")
            cur.execute("SELECT COUNT(*) as count FROM app_settings WHERE setting_key = 'thresholds'")
            if cur.fetchone()['count'] == 0:
                logger.info("Seeding default threshold settings...")
                import json
                cur.execute(
                    "INSERT INTO app_settings (setting_key, setting_value) VALUES (%s, %s)",
                    ('thresholds', json.dumps(DEFAULT_THRESHOLDS))
                )

            # Check defaults for app_settings (mqtt_config)
            logger.debug("Checking MQTT settings...")
            cur.execute("SELECT COUNT(*) as count FROM app_settings WHERE setting_key = 'mqtt_config'")
            if cur.fetchone()['count'] == 0:
                logger.info("Seeding default MQTT settings...")
                cur.execute(
                    "INSERT INTO app_settings (setting_key, setting_value) VALUES (%s, %s)",
                    ('mqtt_config', json.dumps(DEFAULT_MQTT_SETTINGS))
                )

            # Create Sensor Tables
            for sensor_name, table_name in TABLES.items():
                logger.info(f"Checking table for {sensor_name} ({table_name})...")
                cols_def = []
                
                # Standard Timestamp and ID for all sensor tables (Modified: timestamp first)
                cols_def.append("timestamp TIMESTAMP DEFAULT NOW()")
                cols_def.append("id SERIAL PRIMARY KEY")
                
                # Add specific columns
                sensor_cols = COLUMNS.get(sensor_name, [])
                for col in sensor_cols:
                    if col in ["id", "timestamp"]:
                        continue # Already added
                    
                    # Determine type based on column name or default to FLOAT
                    col_type = "DOUBLE PRECISION"
                    
                    cols_def.append(f"{col} {col_type}")
                
                create_query = f"CREATE TABLE IF NOT EXISTS {table_name} ({', '.join(cols_def)});"
                cur.execute(create_query)
                
                # Add Index for performance
                index_name = f"idx_{table_name}_timestamp"
                cur.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} (timestamp DESC)")

    except Exception as e:
        logger.error(f"Database init error: {e}")


def publish_mqtt_interval(interval: int):
    """
    Publish update interval to MQTT broker.
    Expected by Pico on topic 'setting/interval' with format {"interval": N}
    """
    try:
        topic = "nusahome/setting/interval"
        payload = json.dumps({"interval": interval})

        mqtt_manager.publish(topic, payload)

    except Exception as e:
        logger.error(f"MQTT SYNC ERROR | Failed to publish interval: {e}")


def publish_mqtt_relay(gpio: int, state: bool):
    """
    Publish relay state to MQTT broker via external subprocess to ensure stability in background.
    """
    try:
        topic = f"nusahome/home/relay/{gpio}/set"
        payload = "ON" if state else "OFF"
        
        logger.info(f"MQTT RELAY | Publishing: {topic} -> {payload}")
        mqtt_manager.publish(topic, payload)

    except Exception as e:
        print(f"MQTT RELAY SYNC ERROR | Failed to publish relay state: {e}")
        with open("trace_mqtt.log", "a") as f:
            f.write(f"[{datetime.now().strftime('%H:%M:%S')}] ERROR | GPIO: {gpio}, {e}\n")
def publish_mqtt_relay_mode(gpio: int, mode: str):
    """
    Publish relay mode (auto/manual) to MQTT broker.
    """
    try:
        topic = f"nusahome/home/relay/{gpio}/mode"
        payload = mode.lower()
        
        logger.info(f"MQTT MODE | Publishing: {topic} -> {payload}")
        mqtt_manager.publish(topic, payload)

    except Exception as e:
        logger.error(f"MQTT MODE SYNC ERROR | Failed to publish relay mode: {e}")
