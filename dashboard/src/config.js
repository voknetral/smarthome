// Use relative path for API if in production/auto mode, effectively proxying through Nginx
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL === "auto" || import.meta.env.DEV)
    ? "/api"
    : (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000");

export const MQTT_CONFIG = {
    // Use window.location.hostname if set to 'auto' or 'localhost' in production, to support LAN access
    host: (!import.meta.env.VITE_MQTT_HOST || import.meta.env.VITE_MQTT_HOST === "auto" || import.meta.env.VITE_MQTT_HOST === "localhost")
        ? "192.168.1.26"
        : import.meta.env.VITE_MQTT_HOST,

    port: parseInt(import.meta.env.VITE_MQTT_PORT) || 1883,
    useSSL: import.meta.env.VITE_MQTT_USE_SSL === "true",
    autoConnect: import.meta.env.VITE_AUTO_CONNECT !== "false",
    topics: {
        dht22: import.meta.env.VITE_TOPIC_DHT22 || "nusahome/sensor/dht22",
        pzem004t: import.meta.env.VITE_TOPIC_PZEM || "nusahome/sensor/pzem004t",
        mq2: import.meta.env.VITE_TOPIC_MQ2 || "nusahome/sensor/mq2",
        bh1750: import.meta.env.VITE_TOPIC_BH1750 || "nusahome/sensor/bh1750",
        relay_cmd: import.meta.env.VITE_TOPIC_RELAY_CMD || "nusahome/home/relay/",
        relay_status_base: import.meta.env.VITE_TOPIC_RELAY_STATUS_BASE || "nusahome/home/relay/",
        interval: import.meta.env.VITE_TOPIC_INTERVAL || "nusahome/setting/interval",
        aggregate: "nusahome/home/sensors/aggregate",
        device_status: "nusahome/system/+/status"
    },
    updateInterval: parseInt(import.meta.env.VITE_UPDATE_INTERVAL) || 5,
    maxDataPoints: parseInt(import.meta.env.VITE_MAX_DATA_POINTS) || 300,
    thresholds: {
        dht22: {
            tempMax: 35,
            tempMin: 15,
            humMax: 80,
            humMin: 30,
        },
        mq2: {
            smokeMax: 500,
            smokeWarn: 350,
            lpgMax: 1000,
            lpgWarn: 500,
            coMax: 500,
            coWarn: 200,
        },
        pzem004t: {
            powerMax: 2000,
            voltageMin: 200,
            voltageMax: 240,
            currentMax: 9,
            energyMax: 100,
            pfMin: 0.7,
            freqMin: 49,
            freqMax: 51,
        },
        bh1750: {
            luxMax: 100000,
            luxMin: 0,
        },
    },
};
