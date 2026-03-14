# ==============================================
# NUSAHOME - CONFIGURATION
# ==============================================


# ------------------------------------------------
# WIFI
# ------------------------------------------------
WIFI_SSID = "TEKNOLAB Office"
WIFI_PASS = "selamatdatang"


# ------------------------------------------------
# MQTT
# ------------------------------------------------
MQTT_BROKER = "192.168.1.26"
MQTT_PORT = 1883
MQTT_CLIENT_ID = "PicoW_SmartHome"

MQTT_KEEPALIVE = 60
MQTT_RECONNECT_MAX = 5
MQTT_RECONNECT_DELAY = 2


# ------------------------------------------------
# MQTT TOPICS
# ------------------------------------------------
TOPIC_DHT22 = "nusahome/sensor/dht22"
TOPIC_PZEM004T = "nusahome/sensor/pzem004t"
TOPIC_BH1750 = "nusahome/sensor/bh1750"
TOPIC_MQ2 = "nusahome/sensor/mq2"

TOPIC_RELAY_CMD = "nusahome/home/relay/+/set"
TOPIC_RELAY_STATE = "nusahome/home/relay/{gpio}/state"

TOPIC_INTERVAL = "nusahome/setting/interval"
TOPIC_STATUS = "nusahome/system/picow/status"


# ------------------------------------------------
# API
# ------------------------------------------------
API_BASE_URL = "https://api.pantau-rumah.my.id/api"


# ------------------------------------------------
# GPIO / HARDWARE
# ------------------------------------------------
DHT22_PIN = 2
MQ2_PIN = 26

PZEM_TX_PIN = 0
PZEM_RX_PIN = 1
PZEM_ADDR = 0x05

BH1750_SDA_PIN = 8
BH1750_SCL_PIN = 9
BH1750_ADDR = 0x23

RELAY_PINS = [10, 11, 12, 13]
RELAY_ACTIVE_LOW = False


# ------------------------------------------------
# TIMING / INTERVAL
# ------------------------------------------------
SENSOR_READ_INTERVAL = 3
MIN_SAFE_SENSOR_INTERVAL = 2

RELAY_SYNC_INTERVAL = 60

HEARTBEAT_INTERVAL = 15
HEARTBEAT_TIMEOUT = 60
STATUS_CHECK_INTERVAL = 5


# ------------------------------------------------
# ERROR / RETRY
# ------------------------------------------------
SYNC_RETRY_MAX = 3
SYNC_RETRY_DELAY = 2

ERROR_THRESHOLD = 3

