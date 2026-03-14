import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import mqtt from "mqtt";
import { useAuth } from "./AuthContext";
import { MQTT_CONFIG, API_BASE_URL } from "../config";


const MqttContext = createContext();

const DEFAULT_SETTINGS = MQTT_CONFIG;

export function MqttProvider({ children }) {
  const { isAuthenticated, fetchWithAuth } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionTime, setConnectionTime] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const MAX_RECONNECT_ATTEMPTS = 10; // Maximum number of reconnection attempts
  const RECONNECT_INTERVAL_BASE = 1000; // Base delay in ms (will be multiplied by attempt number)
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem("mqttSettings");
    if (!saved) return DEFAULT_SETTINGS;

    try {
      const parsed = JSON.parse(saved);
      // Migration 1: If topics are missing 'nusahome/' prefix, force update them to the new defaults
      if (parsed.topics && parsed.topics.dht22 && !parsed.topics.dht22.startsWith("nusahome/")) {
        console.warn("[MQTT] Legacy topics detected in localStorage. Migrating to 'nusahome/' prefix.");
        parsed.topics = { ...DEFAULT_SETTINGS.topics };
        localStorage.setItem("mqttSettings", JSON.stringify(parsed));
      }

      // Migration 2: If host is still HiveMQ (legacy default), force update to the new default
      if (parsed.host === "broker.hivemq.com") {
        console.warn("[MQTT] Migrating from legacy HiveMQ to new default broker.");
        const migrated = {
          ...parsed,
          host: DEFAULT_SETTINGS.host,
          port: DEFAULT_SETTINGS.port,
          ws_port: DEFAULT_SETTINGS.port
        };
        localStorage.setItem("mqttSettings", JSON.stringify(migrated));
        return migrated;
      }

      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (e) {
      console.error("[MQTT] Failed to parse saved settings:", e);
      return DEFAULT_SETTINGS;
    }
  });

  const [sensorData, setSensorData] = useState(() => ({
    dht22: { temp: [], hum: [], time: [] },
    mq2: { lpg: [], co: [], smoke: [], time: [] },
    pzem004t: { voltage: [], power: [], current: [], energy: [], frequency: [], pf: [], time: [] },
    bh1750: { lux: [], time: [] },
  }));

  const [relayStates, setRelayStates] = useState({
    1: false,
    2: false,
    3: false,
    4: false,
  });

  const [relayModes, setRelayModes] = useState({
    1: "manual",
    2: "manual",
    3: "manual",
    4: "manual",
  });

  // Pending relay states (waiting for Pico confirmation)
  const [pendingRelays, setPendingRelays] = useState({});

  // Device status state (Pico lifecycle)
  const [deviceStatus, setDeviceStatus] = useState({
    status: "OFFLINE",
    uptime: null,
    ip: null,
    lastSeen: null,
    reason: null,
    device_id: null
  });



  const [history, setHistory] = useState([]);
  const [aggregatedData, setAggregatedData] = useState({}); // New: For AVG/MIN/MAX professional stats

  // Fetch initial data (relays, history, and settings)
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchInitialData = async () => {
      try {
        // Fetch Settings (including MQTT config)
        const settingsRes = await fetchWithAuth(`${API_BASE_URL}/settings`);
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          if (data.success && data.settings) {
            setSettings((prev) => ({
              ...prev,
              ...data.settings.mqtt_config,
              thresholds: data.settings.thresholds || prev.thresholds,
              enableThresholds: data.settings.enable_thresholds ?? prev.enableThresholds,
              telegramConfig: data.settings.telegram_config || prev.telegramConfig
            }));
          }
        }

        // Fetch Relays
        const relayRes = await fetchWithAuth(`${API_BASE_URL}/relays`);
        if (relayRes.ok) {
          const data = await relayRes.json();
          const states = {};
          const modes = {};
          data.forEach((relay) => {
            states[relay.id] = relay.is_active;
            modes[relay.id] = relay.mode;
          });
          setRelayStates((prev) => ({ ...prev, ...states }));
          setRelayModes((prev) => ({ ...prev, ...modes }));
        }

        // Fetch History
        const historyRes = await fetchWithAuth(`${API_BASE_URL}/history`);
        if (historyRes.ok) {
          const data = await historyRes.json();
          const formattedData = data.map(item => {
            const d = new Date(item.timestamp);
            const timeStr = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
            const dateStr = [String(d.getDate()).padStart(2, '0'), String(d.getMonth() + 1).padStart(2, '0'), d.getFullYear()].join('/');
            return {
              ...item,
              time: `${dateStr} ${timeStr}`
            };
          });
          setHistory(formattedData);
        }

        // --- Fetch Initial Sensor Data (Last 1h) ---
        const sensors = ['dht22', 'mq2', 'pzem004t', 'bh1750'];
        const sensorPayloads = await Promise.all(
          sensors.map(s => fetchWithAuth(`${API_BASE_URL}/history/${s}?range=1h`).then(res => res.ok ? res.json() : null))
        );

        setSensorData(prev => {
          const newState = { ...prev };
          sensorPayloads.forEach((payload, idx) => {
            if (!payload) return;
            const sensor = sensors[idx];
            const data = payload.data || [];

            if (sensor === 'dht22') {
              newState.dht22 = {
                temp: data.map(d => d.temperature).filter(v => v !== null && v !== undefined),
                hum: data.map(d => d.humidity).filter(v => v !== null && v !== undefined),
                time: data.map(d => {
                  const date = new Date((d.time_bucket || d.timestamp).replace(" ", "T"));
                  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
                })
              };
            } else if (sensor === 'mq2') {
              newState.mq2 = {
                lpg: data.map(d => d.gas_lpg).filter(v => v !== null && v !== undefined),
                co: data.map(d => d.gas_co).filter(v => v !== null && v !== undefined),
                smoke: data.map(d => d.smoke).filter(v => v !== null && v !== undefined),
                time: data.map(d => {
                  const date = new Date((d.time_bucket || d.timestamp).replace(" ", "T"));
                  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
                })
              };
            } else if (sensor === 'pzem004t') {
              newState.pzem004t = {
                voltage: data.map(d => d.voltage).filter(v => v !== null && v !== undefined),
                current: data.map(d => d.current).filter(v => v !== null && v !== undefined),
                power: data.map(d => d.power).filter(v => v !== null && v !== undefined),
                energy: data.map(d => d.energy).filter(v => v !== null && v !== undefined),
                frequency: data.map(d => d.frequency).filter(v => v !== null && v !== undefined),
                pf: data.map(d => d.power_factor).filter(v => v !== null && v !== undefined),
                time: data.map(d => {
                  const date = new Date((d.time_bucket || d.timestamp).replace(" ", "T"));
                  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
                })
              };
            } else if (sensor === 'bh1750') {
              newState.bh1750 = {
                lux: data.map(d => d.lux).filter(v => v !== null && v !== undefined),
                time: data.map(d => {
                  const date = new Date((d.time_bucket || d.timestamp).replace(" ", "T"));
                  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
                })
              };
            }
          });
          return newState;
        });
      } catch (err) {
        console.error("Failed to fetch initial data:", err);
      }
    };
    fetchInitialData();
  }, [isAuthenticated]);

  // Notifications for threshold alerts
  const [notifications, setNotifications] = useState([]);
  const lastAlertRef = useRef({});
  const ALERT_COOLDOWN = 60000; // 1 minute cooldown between same alerts

  const clientRef = useRef(null);
  const isConnectedRef = useRef(false);
  const isReconnectingRef = useRef(false);
  const lastUpdateRef = useRef({
    dht22: 0,
    mq2: 0,
    pzem004t: 0,
    bh1750: 0,
  });
  const lastToggleRef = useRef({}); // Track last manual toggle time for each relay
  const lastModeToggleRef = useRef({}); // Track last mode toggle time

  // Absolute Source of Truth for Relay States (to prevent race conditions)
  const relayStatesRef = useRef({ 1: false, 2: false, 3: false, 4: false });
  useEffect(() => {
    relayStatesRef.current = relayStates;
  }, [relayStates]);

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    isReconnectingRef.current = isReconnecting;
  }, [isReconnecting]);

  const addHistoryEntry = useCallback(
    async (event, status, statusClass = "text-green-600") => {
      const now = new Date();
      const entry = {
        time: (() => {
          const d = new Date();
          const timeStr = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
          const dateStr = [String(d.getDate()).padStart(2, '0'), String(d.getMonth() + 1).padStart(2, '0'), d.getFullYear()].join('/');
          return `${dateStr} ${timeStr}`;
        })(),
        event,
        status,
        statusClass,
      };

      // Pessimistic UI: update local state for responsiveness if needed, 
      // but let's do optimistic + persistence
      setHistory((prev) => {
        const last = prev[0];
        if (last && last.event === entry.event && last.status === entry.status) return prev;
        return [entry, ...prev].slice(0, 100);
      });

      try {
        await fetchWithAuth(`${API_BASE_URL}/history`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            event,
            status,
            status_class: statusClass
          }),
        });
      } catch (err) {
        console.error("Failed to save history entry:", err);
      }
    },
    []
  );

  const clearHistory = useCallback(async () => {
    try {
      setHistory([]);
      await fetchWithAuth(`${API_BASE_URL}/history`, {
        method: "DELETE"
      });
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  }, []);

  // Add notification with auto-dismiss
  const addNotification = useCallback((message, type = 'warning', sensor = '') => {
    // Redundant switch for safety
    if (!settings.enableThresholds) return;

    const id = Date.now();
    const alertKey = `${sensor}-${message}`;
    const now = Date.now();

    // Check cooldown to prevent spam
    if (lastAlertRef.current[alertKey] && now - lastAlertRef.current[alertKey] < ALERT_COOLDOWN) {
      return;
    }
    lastAlertRef.current[alertKey] = now;

    setNotifications(prev => [
      {
        id, message, type, sensor, time: (() => {
          const d = new Date();
          return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
        })()
      },
      ...prev.slice(0, 4) // Keep max 5 notifications
    ]);

    // Auto dismiss after 10 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 10000);


  }, []); // Remove settings dependency

  const dismissNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Check thresholds and trigger notifications
  const sendTelegramAlert = useCallback(async (message) => {
    // Disabled: Handled by server-side threshold checker
    return;
  }, []);

  const checkThresholds = useCallback((sensor, data) => {
    // Ensure we respect the global enable switch
    if (!settings.enableThresholds) return;

    const thresholds = settings.thresholds?.[sensor];
    if (!thresholds) return;

    const checkAndNotify = (val, limit, type, label, unit) => {
      if (val === undefined || val === null || limit === undefined || limit === null || limit === "") return;

      const numVal = parseFloat(val);
      const numLimit = parseFloat(limit);
      if (isNaN(numVal) || isNaN(numLimit)) return;

      let triggered = false;
      let msg = "";

      if (type === 'max' && numVal > numLimit) {
        triggered = true;
        msg = `🚨 *ALERT: ${sensor.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━━━\n📌 Kondisi: *${label} Tinggi*\n📊 Nilai: \`${numVal}${unit}\`\n⚠️ Batas: \`${numLimit}${unit}\`\n━━━━━━━━━━━━━━━━━━━━\n🕒 _${new Date().toLocaleString('id-ID')}_`;
      } else if (type === 'min' && numVal < numLimit) {
        triggered = true;
        msg = `🚨 *ALERT: ${sensor.toUpperCase()}*\n━━━━━━━━━━━━━━━━━━━━\n📌 Kondisi: *${label} Rendah*\n📊 Nilai: \`${numVal}${unit}\`\n⚠️ Batas: \`${numLimit}${unit}\`\n━━━━━━━━━━━━━━━━━━━━\n🕒 _${new Date().toLocaleString('id-ID')}_`;
      }

      if (triggered) {
        const alertKey = `${sensor}-${label}-${type}`;
        const now = Date.now();

        // CLEAN MESSAGE for Local Notification (No markdown, no dividers, no timestamp)
        const localMsg = `⚠️ ${label}: ${numVal}${unit} (Batas: ${numLimit}${unit})`;

        // Local notification
        if (label.includes("Bahaya") || label.includes("tinggi") || label.includes("rendah")) {
          addNotification(localMsg, 'danger', sensor.toUpperCase());
        } else {
          addNotification(localMsg, 'warning', sensor.toUpperCase());
        }

        // Telegram Alert (with cooldown)
        if (!lastAlertRef.current[alertKey] || now - lastAlertRef.current[alertKey] > ALERT_COOLDOWN) {
          // Note: Persistence and Telegram alerts are now handled by the backend service.
          // The dashboard only shows the local notification toast.
          lastAlertRef.current[alertKey] = now;
        }
      }
    };

    switch (sensor) {
      case 'dht22': {
        const { temp, hum } = data;
        checkAndNotify(temp, thresholds.tempMax, 'max', 'Suhu', '°C');
        checkAndNotify(temp, thresholds.tempMin, 'min', 'Suhu', '°C');
        checkAndNotify(hum, thresholds.humMax, 'max', 'Kelembaban', '%');
        checkAndNotify(hum, thresholds.humMin, 'min', 'Kelembaban', '%');
        break;
      }
      case 'mq2': {
        const { lpg, co, smoke } = data;
        // Smoke
        checkAndNotify(smoke, thresholds.smokeMax, 'max', 'Asap (Bahaya, est.)', ' ppm');
        checkAndNotify(smoke, thresholds.smokeWarn, 'max', 'Asap (Waspada, est.)', ' ppm');
        // LPG
        checkAndNotify(lpg, thresholds.lpgMax, 'max', 'LPG (Bahaya, est.)', ' ppm');
        checkAndNotify(lpg, thresholds.lpgWarn, 'max', 'LPG (Waspada, est.)', ' ppm');
        // CO
        checkAndNotify(co, thresholds.coMax, 'max', 'CO (Bahaya, est.)', ' ppm');
        checkAndNotify(co, thresholds.coWarn, 'max', 'CO (Waspada, est.)', ' ppm');
        break;
      }
      case 'pzem004t': {
        const { voltage, power, current, energy, frequency, pf } = data;
        checkAndNotify(power, thresholds.powerMax, 'max', 'Daya', 'W');
        checkAndNotify(voltage, thresholds.voltageMax, 'max', 'Tegangan', 'V');
        checkAndNotify(voltage, thresholds.voltageMin, 'min', 'Tegangan', 'V');
        checkAndNotify(current, thresholds.currentMax, 'max', 'Arus', 'A');
        checkAndNotify(energy, thresholds.energyMax, 'max', 'Energi', 'kWh');
        checkAndNotify(frequency, thresholds.freqMax, 'max', 'Frekuensi', 'Hz');
        checkAndNotify(frequency, thresholds.freqMin, 'min', 'Frekuensi', 'Hz');
        checkAndNotify(pf, thresholds.pfMin, 'min', 'Power Factor', '');
        break;
      }
      case 'bh1750': {
        const { lux } = data;
        checkAndNotify(lux, thresholds.luxMax, 'max', 'Cahaya', ' lux');
        checkAndNotify(lux, thresholds.luxMin, 'min', 'Cahaya', ' lux');
        break;
      }
    }
  }, [addNotification, addHistoryEntry, sendTelegramAlert]); // Removed settings dependency

  const setupNewConnection = useCallback((isManualReconnect = false) => {
    if (isManualReconnect) {
      setReconnectAttempts(0);
      setIsReconnecting(true);
      addHistoryEntry("Initiating manual reconnect...", "Connecting", "text-yellow-600");
    }

    const connectionConfig = {
      host: settings.host,
      port: settings.port,
      ws_port: settings.ws_port,
      useSSL: settings.useSSL,
    };

    const protocol = connectionConfig.useSSL ? "wss" : "ws";
    const mqttPort = connectionConfig.ws_port || (connectionConfig.host === "broker.hivemq.com" ? 8884 : connectionConfig.port);
    const url = `${protocol}://${connectionConfig.host}:${mqttPort}/mqtt`;
    const clientId = "WebDashboardClient_" + Math.random().toString(16).slice(2, 10);

    const client = mqtt.connect(url, {
      clientId,
      keepalive: 30, // Reduced from 60 to detect disconnections faster
      reconnectPeriod: 0, // We'll handle reconnection manually
      connectTimeout: 10 * 1000, // 10 seconds connection timeout
      clean: true,
      reschedulePings: true,
      rejectUnauthorized: false, // For self-signed certificates
    });

    clientRef.current = client;

    client.on("connect", () => {
      setIsConnected(true);
      setIsReconnecting(false);
      setConnectionTime(Date.now());

      if (reconnectAttempts > 0) {
        addHistoryEntry("MQTT Reconnected", "Online", "text-green-600");
      } else {
        addHistoryEntry("MQTT Connected", "Online", "text-green-600");
      }

      setReconnectAttempts(0);

      Object.values(settings.topics).forEach((topic) => {
        if (topic && !topic.endsWith("/") && client.connected && !client.disconnecting) {
          client.subscribe(topic, { qos: 1 });
        }
      });

      // Wildcard subscribe to device status and relay states
      if (client.connected && !client.disconnecting) {
        client.subscribe(settings.topics.device_status || "nusahome/system/+/status", { qos: 1 });
        client.subscribe(`${settings.topics.relay_status_base}+/state`, { qos: 1 });
        client.subscribe(`${settings.topics.relay_status_base}+/mode`, { qos: 1 });
      }
    });

    client.on("close", () => {
      if (isConnectedRef.current) {
        setIsConnected(false);
        setConnectionTime(null);
        addHistoryEntry("MQTT Connection Closed", "Offline", "text-red-600");
      }

      // Jangan reconnect jika sudah melebihi batas percobaan
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        addHistoryEntry(
          `Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Please check your connection and try again.`,
          "Connection Failed",
          "text-red-600"
        );
        return;
      }

      // Jadwalkan reconnect dengan exponential backoff
      const delay = Math.min(
        RECONNECT_INTERVAL_BASE * Math.pow(2, reconnectAttempts),
        30000 // Max 30 seconds
      );

      setTimeout(() => {
        if (!isConnectedRef.current && !isReconnectingRef.current) {
          setIsReconnecting(true);
          setReconnectAttempts((prev) => {
            const newAttempt = prev + 1;
            addHistoryEntry(
              "Attempting to reconnect...",
              "Reconnecting",
              "text-yellow-600"
            );
            return newAttempt;
          });
          connect();
        }
      }, delay);
    });

    client.on("offline", () => {
      setIsConnected(false);
      addHistoryEntry("MQTT Connection Lost", "Offline", "text-red-600");
    });

    client.on("error", (err) => {
      setIsConnected(false);
      setReconnectAttempts((prev) => prev + 1);

      const errorMsg = err.message || "Unknown MQTT Error";
      console.error("MQTT connection error:", err);

      // Detailed hint for common browser WebSocket issues
      if (errorMsg.includes("Script error") || !errorMsg) {
        addHistoryEntry("MQTT Connection Blocked / SSL Error. Check if your browser/network blocks Port 8884.", "Error", "text-red-600");
      } else {
        addHistoryEntry(`MQTT Error: ${errorMsg}`, "Error", "text-red-600");
      }
    });

    client.on("message", (topic, message) => {
      try {
        const messageStr = message.toString().trim();
        let payload;

        // Smart Parsing: Try JSON first, fallback to raw string if it's "ON", "OFF", or other plain text
        try {
          payload = JSON.parse(messageStr);
        } catch (e) {
          payload = messageStr;
        }

        const time = (() => {
          const d = new Date();
          return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
        })();
        const nowTs = Date.now();
        const intervalMs = (settings.updateInterval || DEFAULT_SETTINGS.updateInterval) * 1000;

        // Fallback: If we get any message from known sensor/relay topics, the device is definitely ONLINE
        if (topic.includes("nusahome/sensor/") || topic.includes("nusahome/home/relay/")) {
          setDeviceStatus(prev => {
            const newState = { ...prev, lastSeen: nowTs };
            if (prev.status === "OFFLINE") {
              newState.status = "ONLINE";
            }
            return newState;
          });
        }

        if (topic === settings.topics.dht22) {
          // Validate and parse temperature and humidity from payload { temp, hum }
          const rawTemp = payload.temp ?? payload.temperature;
          const rawHum = payload.hum ?? payload.humidity;

          const temp = parseFloat(rawTemp);
          const hum = parseFloat(rawHum);

          if (!isNaN(temp) && !isNaN(hum)) {
            const cleanTemp = Number(temp.toFixed(1));
            const cleanHum = Number(hum.toFixed(1));
            lastUpdateRef.current.dht22 = nowTs;

            // Check thresholds
            checkThresholds('dht22', { temp: cleanTemp, hum: cleanHum });

            setSensorData((prev) => {
              const newTemp = [...prev.dht22.temp, cleanTemp];
              const newHum = [...prev.dht22.hum, cleanHum];
              const newTime = [...prev.dht22.time, time];

              // If canvas is full, keep the last 30 points and remove old ones gradually
              if (newTemp.length > (settings.maxDataPoints || DEFAULT_SETTINGS.maxDataPoints)) {
                const keepPoints = settings.maxDataPoints || DEFAULT_SETTINGS.maxDataPoints;

                return {
                  ...prev,
                  dht22: {
                    temp: newTemp.slice(-keepPoints),
                    hum: newHum.slice(-keepPoints),
                    time: newTime.slice(-keepPoints),
                  },
                };
              }

              return {
                ...prev,
                dht22: {
                  temp: newTemp,
                  hum: newHum,
                  time: newTime,
                },
              };
            });
          }
        } else if (topic === settings.topics.mq2) {
          // Validate and parse MQ2 sensor data with fallbacks for different key variations
          const lpg = parseFloat(payload.lpg ?? payload.gas_lpg ?? payload.LPG);
          const co = parseFloat(payload.co ?? payload.gas_co ?? payload.CO);
          const smoke = parseFloat(payload.smoke ?? payload.Smoke);

          if (!isNaN(lpg) && !isNaN(co) && !isNaN(smoke)) {
            const cleanLpg = Number(lpg.toFixed(1));
            const cleanCo = Number(co.toFixed(1));
            const cleanSmoke = Number(smoke.toFixed(1));
            lastUpdateRef.current.mq2 = nowTs;

            // Check thresholds
            checkThresholds('mq2', { lpg: cleanLpg, co: cleanCo, smoke: cleanSmoke });

            setSensorData((prev) => {
              const newLpg = [...prev.mq2.lpg, cleanLpg];
              const newCo = [...prev.mq2.co, cleanCo];
              const newSmoke = [...prev.mq2.smoke, cleanSmoke];
              const newTime = [...prev.mq2.time, time];

              // If canvas is full, keep the last 30 points and remove old ones gradually
              if (newLpg.length > (settings.maxDataPoints || DEFAULT_SETTINGS.maxDataPoints)) {
                const keepPoints = settings.maxDataPoints || DEFAULT_SETTINGS.maxDataPoints;

                return {
                  ...prev,
                  mq2: {
                    lpg: newLpg.slice(-keepPoints),
                    co: newCo.slice(-keepPoints),
                    smoke: newSmoke.slice(-keepPoints),
                    time: newTime.slice(-keepPoints),
                  },
                };
              }

              return {
                ...prev,
                mq2: {
                  lpg: newLpg,
                  co: newCo,
                  smoke: newSmoke,
                  time: newTime,
                },
              };
            });
          }
        } else if (topic === settings.topics.pzem004t) {
          // Validate and parse PZEM sensor data
          const voltage = parseFloat(payload.voltage);
          const power = parseFloat(payload.power);
          const current = parseFloat(payload.current);
          const energy = payload.energy !== undefined ? parseFloat((parseFloat(payload.energy) / 1000).toFixed(2)) : NaN;
          // power factor utama dari "power_factor", fallback ke "pf" jika ada
          const rawPf = payload.power_factor ?? payload.pf;
          const pf = rawPf !== undefined ? parseFloat(rawPf) : NaN;
          // frequency dari "frequency" atau "freq"
          const rawFreq = payload.frequency ?? payload.freq;
          const frequency = rawFreq !== undefined ? parseFloat(rawFreq) : NaN;

          if (!isNaN(voltage) && !isNaN(power) && !isNaN(current)) {
            const cleanVoltage = Number(voltage.toFixed(1));
            const cleanPower = Number(power.toFixed(1));
            const cleanCurrent = Number(current.toFixed(3));
            const cleanEnergy = !isNaN(energy) ? Number(energy.toFixed(3)) : NaN;
            const cleanFreq = !isNaN(frequency) ? Number(frequency.toFixed(1)) : NaN;
            const cleanPf = !isNaN(pf) ? Number(pf.toFixed(2)) : NaN;

            lastUpdateRef.current.pzem004t = nowTs;

            // Check thresholds
            checkThresholds('pzem004t', {
              voltage: cleanVoltage,
              power: cleanPower,
              current: cleanCurrent,
              energy: cleanEnergy,
              frequency: cleanFreq,
              pf: cleanPf
            });

            setSensorData((prev) => {
              const newVoltage = [...prev.pzem004t.voltage, cleanVoltage];
              const newPower = [...prev.pzem004t.power, cleanPower];
              const newCurrent = [...prev.pzem004t.current, cleanCurrent];
              const newEnergy = !isNaN(cleanEnergy) ? [...(prev.pzem004t.energy || []), cleanEnergy] : (prev.pzem004t.energy || []);
              const newFrequency = !isNaN(cleanFreq) ? [...(prev.pzem004t.frequency || []), cleanFreq] : (prev.pzem004t.frequency || []);
              const newPf = !isNaN(cleanPf) ? [...(prev.pzem004t.pf || []), cleanPf] : (prev.pzem004t.pf || []);
              const newTime = [...prev.pzem004t.time, time];

              // If canvas is full, keep the last 30 points and remove old ones gradually
              if (newVoltage.length > (settings.maxDataPoints || DEFAULT_SETTINGS.maxDataPoints)) {
                const keepPoints = settings.maxDataPoints || DEFAULT_SETTINGS.maxDataPoints;

                return {
                  ...prev,
                  pzem004t: {
                    voltage: newVoltage.slice(-keepPoints),
                    power: newPower.slice(-keepPoints),
                    current: newCurrent.slice(-keepPoints),
                    energy: newEnergy.slice(-keepPoints),
                    frequency: newFrequency.slice(-keepPoints),
                    pf: newPf.slice(-keepPoints),
                    time: newTime.slice(-keepPoints),
                  },
                };
              }

              return {
                ...prev,
                pzem004t: {
                  voltage: newVoltage,
                  power: newPower,
                  current: newCurrent,
                  energy: newEnergy,
                  frequency: newFrequency,
                  pf: newPf,
                  time: newTime,
                },
              };
            });
          }
        } else if (topic === settings.topics.bh1750) {
          // Validate and parse BH1750 sensor data
          const lux = parseFloat(payload.lux);

          if (!isNaN(lux)) {
            const cleanLux = Number(lux.toFixed(1));
            lastUpdateRef.current.bh1750 = nowTs;

            // Check thresholds
            checkThresholds('bh1750', { lux: cleanLux });

            setSensorData((prev) => {
              const newLux = [...prev.bh1750.lux, cleanLux];
              const newTime = [...prev.bh1750.time, time];

              // If canvas is full, keep the last 30 points and remove old ones gradually
              if (newLux.length > (settings.maxDataPoints || DEFAULT_SETTINGS.maxDataPoints)) {
                const keepPoints = settings.maxDataPoints || DEFAULT_SETTINGS.maxDataPoints;

                return {
                  ...prev,
                  bh1750: {
                    lux: newLux.slice(-keepPoints),
                    time: newTime.slice(-keepPoints),
                  },
                };
              }

              return {
                ...prev,
                bh1750: {
                  lux: newLux,
                  time: newTime,
                },
              };
            });
          }
        } else if (topic.includes("nusahome/home/relay/")) {
          // Topic format handle both: nusahome/home/relay/{gpio}/[state|mode]
          const parts = topic.split("/");
          const relayIdx = parts.indexOf("relay");
          if (relayIdx !== -1 && relayIdx + 1 < parts.length) {
            const gpioNum = parseInt(parts[relayIdx + 1]);
            if (gpioNum >= 10 && gpioNum <= 13) {
              const relayNum = gpioNum - 9;

              if (topic.endsWith("/state")) {
                const state = payload === "ON" || payload.state === "ON" || payload.state === true;

                // Clear pending status for this relay
                setPendingRelays((prev) => {
                  const newPending = { ...prev };
                  delete newPending[relayNum];
                  return newPending;
                });

                // Update relay state based on Pico confirmation
                setRelayStates((prev) => {
                  if (prev[relayNum] === state) return prev;
                  return { ...prev, [relayNum]: state };
                });
              } else if (topic.endsWith("/mode")) {
                // Bounce-back protection (ignore MQTT updates for 2s after local toggle)
                const lastToggle = lastModeToggleRef.current[relayNum] || 0;
                if (Date.now() - lastToggle < 2000) {
                  return;
                }

                const mode = payload;

                setRelayModes((prev) => {
                  if (prev[relayNum] === mode) return prev;
                  return { ...prev, [relayNum]: mode };
                });
              }
            }
          }
        } else if (topic === settings.topics.aggregate) {
          // Handle professional aggregation payload (AVG 30s, MIN/MAX 60s)
          setAggregatedData(payload);
        } else if (topic.includes("nusahome/system/") && topic.endsWith("/status")) {
          // Device status message
          console.log(`[MQTT] Status message received on ${topic}:`, payload);

          // Simplified status mapping: everything active is 'ONLINE'
          const rawStatus = (payload.status || "OFFLINE").toUpperCase();
          const simplifiedStatus = ["OFFLINE", "ERROR"].includes(rawStatus) ? "OFFLINE" : "ONLINE";

          setDeviceStatus(prev => ({
            ...prev,
            status: simplifiedStatus,
            uptime: payload.uptime ?? prev.uptime,
            ip: payload.ip ?? prev.ip,
            reason: payload.reason ?? null,
            device_id: payload.device_id ?? prev.device_id,
            lastSeen: Date.now()
          }));
        }
      } catch (e) {
        console.error("Error parsing MQTT message:", e);
      }
    });

    return () => {
      console.log("[MQTT] Cleaning up connection...");
      if (clientRef.current) {
        clientRef.current.end(true);
        clientRef.current = null;
      }
    };
  }, [
    settings.host,
    settings.port,
    settings.ws_port,
    settings.useSSL,
    settings.topics, // Added topics to deps
    addHistoryEntry,
  ]);

  const connect = useCallback((isManualReconnect = false) => {
    if (clientRef.current) {
      if (isManualReconnect) {
        console.log("[MQTT] Manual reconnect requested, ending current client...");
        clientRef.current.end(true);
        clientRef.current = null;
        return setupNewConnection(true);
      }
      return () => { }; // Already connecting/connected
    }
    return setupNewConnection(isManualReconnect);
  }, [setupNewConnection]);



  const toggleRelay = useCallback(
    (relayNum) => {
      if (!clientRef.current || !isConnected) return;

      // Use Ref to get the absolute latest state (bypassing stale render closure)
      const currentVal = relayStatesRef.current[relayNum];
      const nextVal = !currentVal;

      // Mark relay as pending (waiting for Pico confirmation)
      setPendingRelays(prev => ({ ...prev, [relayNum]: { targetState: nextVal, timestamp: Date.now() } }));

      lastToggleRef.current[relayNum] = Date.now();

      addHistoryEntry(
        `Relay ${relayNum} Toggled`,
        `API Request: ${nextVal ? "ON" : "OFF"}`,
        nextVal ? "text-green-400" : "text-slate-400"
      );

      // BACKEND SYNC AND COMMAND
      fetchWithAuth(`${API_BASE_URL}/relays/${relayNum}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextVal }),
      }).catch(err => console.error("[API] Relay state sync failed:", err));
    },
    [isConnected, addHistoryEntry]
  );

  const setRelayMode = useCallback(async (relayId, newMode) => {
    // 1. Optimistic Update
    setRelayModes(prev => ({ ...prev, [relayId]: newMode }));
    lastModeToggleRef.current[relayId] = Date.now();

    // 2. API Call
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/relays/${relayId}/mode`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ mode: newMode }),
      });

      if (!res.ok) throw new Error("Gagal mengubah mode");

      addHistoryEntry(
        `Relay ${relayId} switch to ${newMode === 'auto' ? 'Otomatis' : 'Manual'}`,
        "Mode Switch",
        "text-blue-600"
      );
    } catch (err) {
      console.error("Failed to set relay mode:", err);
      // Revert on error
      setRelayModes(prev => ({ ...prev, [relayId]: newMode === 'auto' ? 'manual' : 'auto' }));
    }
  }, [fetchWithAuth, addHistoryEntry]);

  const updateSettings = useCallback((newSettings) => {
    setSettings((prev) => {
      const merged = {
        ...prev,
        ...newSettings,
        topics: newSettings.topics
          ? { ...prev.topics, ...newSettings.topics }
          : prev.topics,
        thresholds: newSettings.thresholds
          ? { ...prev.thresholds, ...newSettings.thresholds }
          : prev.thresholds,
      };

      localStorage.setItem("mqttSettings", JSON.stringify(merged));
      return merged;
    });
  }, []);

  // Publish interval update to Pico
  const publishInterval = useCallback(
    (interval) => {
      if (!clientRef.current || !isConnected) {
        console.warn("MQTT not connected, cannot publish interval");
        return false;
      }
      const topic = settings.topics.interval || "nusahome/setting/interval";
      const payload = JSON.stringify({ interval: Number(interval) });

      if (!clientRef.current.connected || clientRef.current.disconnecting) {
        console.warn("MQTT client not ready to publish");
        return false;
      }

      clientRef.current.publish(topic, payload, { qos: 1 }, (err) => {
        if (err) {
          console.error("Failed to publish interval:", err);
          return;
        }
        console.log(`[MQTT] Interval update published (QoS 1): ${interval}s`);
        addHistoryEntry(`Interval update: ${interval}s`, "Sent to Pico", "text-blue-600");
      });
      return true;
    },
    [isConnected, settings.topics.interval, addHistoryEntry]
  );

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  const value = {
    isConnected,
    connectionTime,
    reconnectAttempts,
    maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
    isReconnecting,
    settings,
    sensorData,
    aggregatedData,
    relayStates,
    relayModes,
    pendingRelays,
    history,
    deviceStatus,
    notifications,
    connect: () => connect(true), // Wrapped to indicate manual reconnect
    toggleRelay,
    setRelayMode,
    updateSettings,
    addHistoryEntry,
    clearHistory,
    addNotification,
    dismissNotification,
    clearNotifications,
    publishInterval,
    DEFAULT_SETTINGS,
  };

  return <MqttContext.Provider value={value}>{children}</MqttContext.Provider>;
}

export function useMqtt() {
  const context = useContext(MqttContext);
  if (!context) {
    throw new Error("useMqtt must be used within a MqttProvider");
  }
  return context;
}
