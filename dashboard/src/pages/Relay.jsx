import { useState, useEffect, useCallback } from "react";
import { useMqtt } from "../context/MqttContext";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../config";
import AutomationModal from "../components/AutomationModal";
import { Settings, Clock, Zap, Power } from "lucide-react";

const RELAY_COLORS = {
  1: { color: "yellow", bg: "from-yellow-100 to-yellow-50", text: "text-yellow-600" },
  2: { color: "blue", bg: "from-blue-100 to-blue-50", text: "text-blue-600" },
  3: { color: "red", bg: "from-red-100 to-red-50", text: "text-red-600" },
  4: { color: "purple", bg: "from-purple-100 to-purple-50", text: "text-purple-600" },
};

const SENSOR_LABELS = {
  dht22: "DHT22",
  mq2: "MQ2",
  pzem004t: "PZEM",
  bh1750: "BH1750"
};

const METRIC_LABELS = {
  temperature: { label: "Suhu", unit: "°C" },
  humidity: { label: "Lembab", unit: "%" },
  smoke: { label: "Asap", unit: "ppm" },
  lpg: { label: "LPG", unit: "ppm" },
  co: { label: "CO", unit: "ppm" },
  voltage: { label: "Tegangan", unit: "V" },
  current: { label: "Arus", unit: "A" },
  power: { label: "Daya", unit: "W" },
  energy: { label: "Energi", unit: "kWh" },
  lux: { label: "Cahaya", unit: "lx" }
};




const formatTime24 = (timeStr) => {
  if (!timeStr) return "00:00";
  const [hours, minutes] = timeStr.split(":");
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
};

const icons = {
  1: "M5.636 5.636a9 9 0 1012.728 0M12 3v9",
  2: "M5.636 5.636a9 9 0 1012.728 0M12 3v9",
  3: "M5.636 5.636a9 9 0 1012.728 0M12 3v9",
  4: "M5.636 5.636a9 9 0 1012.728 0M12 3v9",
};

export default function Relay() {
  const { isConnected, deviceStatus, relayStates, relayModes, pendingRelays, toggleRelay, setRelayMode } = useMqtt();
  const isPicoConnected = deviceStatus?.status === "ONLINE";
  const { fetchWithAuth } = useAuth();
  const [apiRelays, setApiRelays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Edit State
  const [editingRelay, setEditingRelay] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);

  // Automation State
  const [showAutomationModal, setShowAutomationModal] = useState(null);

  // Cooldown State
  const [cooldowns, setCooldowns] = useState({});

  const fetchRelays = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchWithAuth(`${API_BASE_URL}/relays`);
      if (!res.ok) throw new Error("Gagal mengambil data relay");
      const data = await res.json();
      setApiRelays(data);
    } catch (err) {
      console.error("Failed to fetch relays:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRelays();
  }, [fetchRelays]);

  // Sync relay status to API when toggled via MQTT
  const [toggling, setToggling] = useState({});

  const handleToggle = async (relayId) => {
    if (cooldowns[relayId] > 0 || pendingRelays[relayId]) return;

    // Start 10 second cooldown
    setCooldowns(prev => ({ ...prev, [relayId]: 10 }));
    setToggling(prev => ({ ...prev, [relayId]: true }));

    // The context function handles pending state + API Sync
    toggleRelay(relayId);

    // Cooldown timer
    const timer = setInterval(() => {
      setCooldowns(prev => {
        const newVal = (prev[relayId] || 0) - 1;
        if (newVal <= 0) {
          clearInterval(timer);
          setToggling(t => ({ ...t, [relayId]: false }));
          return { ...prev, [relayId]: 0 };
        }
        return { ...prev, [relayId]: newVal };
      });
    }, 1000);
  };

  const handleModeToggle = async (relayId, newMode) => {
    try {
      setToggling(prev => ({ ...prev, [relayId]: true }));
      await setRelayMode(relayId, newMode);
    } catch (err) {
      console.error("Mode toggle error:", err);
    } finally {
      setToggling(prev => ({ ...prev, [relayId]: false }));
    }
  };

  const getRelayData = (relayNum) => {
    const apiData = apiRelays.find((r) => r.id === relayNum);
    const isPending = !!pendingRelays[relayNum];
    return {
      num: relayNum,
      id: relayNum,
      name: apiData?.name || `Relay ${relayNum}`,
      gpio: apiData?.gpio || 0,
      desc: apiData?.description || "Tidak ada deskripsi",
      isOn: isPicoConnected ? relayStates[relayNum] : false, // Default to OFF when Pico is offline
      isPending: isPending,
      isToggling: toggling[relayNum] || cooldowns[relayNum] > 0 || isPending,
      cooldown: cooldowns[relayNum] || 0,
      mode: relayModes[relayNum] || apiData?.mode || 'manual',
      auto_config: apiData?.auto_config
    };
  };

  const openEditModal = (relay) => {
    setEditingRelay(relay.num);
    setEditForm({ name: relay.name, description: relay.desc });
  };

  const handleSaveRelay = async () => {
    if (!editingRelay) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/relays/${editingRelay}/name`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(editForm),
      });

      if (!res.ok) throw new Error("Gagal menyimpan perubahan");

      const updatedRelay = await res.json();

      // Update local state
      setApiRelays(prev => prev.map(r => r.id === editingRelay ? { ...r, ...updatedRelay.relay } : r));
      setEditingRelay(null);
    } catch (err) {
      console.error("Save error:", err);
      alert("Gagal menyimpan perubahan: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-section">
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-slate-600">Memuat data relay...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="page-section">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Kontrol Relay</h2>
          <p className="text-slate-600 mt-1">
            Manajemen perangkat 4 channel relay
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full bg-teal-100 text-teal-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            4 Channel Relay
          </span>
          <span className={`inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full ${isConnected ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></span>
            {isConnected ? "MQTT Connected" : "MQTT Disconnected"}
          </span>
          <span className={`hidden sm:inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full ${isPicoConnected ? "bg-teal-100 text-teal-700" : "bg-orange-100 text-orange-700"}`}>
            <span className={`w-2 h-2 rounded-full ${isPicoConnected ? "bg-teal-500 animate-pulse" : "bg-orange-500"}`}></span>
            {isPicoConnected ? "Pico Online" : "Pico Offline"}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {!isConnected && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg">
          ⚠️ MQTT tidak terhubung. Status relay diambil dari database.
        </div>
      )}

      {!isPicoConnected && isConnected && (
        <div className="mb-4 p-4 bg-orange-50 border border-orange-200 text-orange-700 rounded-lg">
          ⚠️ Pico tidak terhubung ke MQTT. Kontrol relay dinonaktifkan sementara.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((relayNum) => {
          const relay = getRelayData(relayNum);
          const colors = RELAY_COLORS[relayNum];

          return (
            <div key={relayNum} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100/50 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg group">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-start gap-4 flex-1">
                  <div className={`p-3 bg-gradient-to-br ${colors.bg} rounded-xl ${colors.text}`}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={icons[relayNum]} />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg text-slate-800 truncate pr-2">{relay.name}</h3>
                    <p className="text-xs text-slate-500 mt-1">GPIO {relay.gpio} • Relay {relay.num}</p>
                    <p className="text-sm text-slate-500 mt-2 line-clamp-2 italic">"{relay.desc}"</p>
                  </div>
                </div>
                <button
                  onClick={() => openEditModal(relay)}
                  disabled={!isPicoConnected}
                  className={`p-2 rounded-lg transition-colors ${!isPicoConnected ? 'text-slate-300 cursor-not-allowed' : 'text-slate-400 hover:text-teal-600 hover:bg-teal-50'}`}
                  title={isPicoConnected ? "Edit Info" : "Pico Offline"}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center justify-between mb-4 p-3 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${relay.mode === 'auto' ? 'bg-teal-100 text-teal-600' : 'bg-slate-200 text-slate-500'}`}>
                    {relay.mode === 'auto' ? <Zap size={14} /> : <Settings size={14} />}
                  </div>
                  <div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400 block leading-none">MODE</span>
                    <span className={`text-xs font-bold uppercase ${relay.mode === 'auto' ? 'text-teal-600' : 'text-slate-500'}`}>
                      {relay.mode === 'auto' ? 'Otomatis' : 'Manual'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleModeToggle(relay.num, relay.mode === 'auto' ? 'manual' : 'auto')}
                  disabled={!isPicoConnected}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${!isPicoConnected ? 'bg-slate-200 cursor-not-allowed opacity-50' : relay.mode === 'auto' ? 'bg-teal-500' : 'bg-slate-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${relay.mode === 'auto' ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  onClick={() => handleToggle(relay.num)}
                  disabled={relay.isToggling || relay.mode === 'auto' || !isPicoConnected}
                  className={`px-4 py-3 rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-2 shadow-sm ${relay.isToggling || relay.mode === 'auto' || !isPicoConnected
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'
                    : relay.isOn
                      ? 'bg-emerald-500 text-white hover:bg-emerald-600 ring-2 ring-emerald-500/20'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  {relay.isPending ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Menunggu... {relay.cooldown > 0 && `(${relay.cooldown}s)`}</span>
                    </>
                  ) : (
                    <span>
                      {relay.isOn ? "ON" : "OFF"}
                      {relay.cooldown > 0 && ` (${relay.cooldown}s)`}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setShowAutomationModal(relay)}
                  className={`px-4 py-3 rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-2 border-2 ${relay.mode === 'auto' && isPicoConnected
                    ? 'border-teal-500/20 bg-teal-50 text-teal-600 hover:bg-teal-100'
                    : 'border-slate-100 bg-white text-slate-400 cursor-not-allowed opacity-50'
                    }`}
                  disabled={relay.mode !== 'auto' || !isPicoConnected}
                >
                  <Clock size={18} />
                  <span>AUTO</span>
                </button>
              </div>

              {relay.mode === 'auto' && relay.auto_config && (
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-tight overflow-hidden">
                  <div className="flex -space-x-1">
                    {(relay.auto_config.rule_type === 'time' || relay.auto_config.rule_type === 'combined') && (
                      <div className="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center border border-white">
                        <Clock size={10} className="text-teal-600" />
                      </div>
                    )}
                    {(relay.auto_config.rule_type === 'sensor' || relay.auto_config.rule_type === 'combined') && (
                      <div className="w-5 h-5 rounded-full bg-cyan-100 flex items-center justify-center border border-white">
                        <Zap size={10} className="text-cyan-600" />
                      </div>
                    )}
                  </div>
                  <span className="truncate">
                    {relay.auto_config.type === 'time' && relay.auto_config.time_rules?.[0] && `⏰ ${formatTime24(relay.auto_config.time_rules[0].start_time)} - ${formatTime24(relay.auto_config.time_rules[0].end_time)}`}
                    {relay.auto_config.type === 'sensor' && relay.auto_config.sensor_rules?.[0] && (
                      (() => {
                        const rule = relay.auto_config.sensor_rules[0];
                        const sensor = SENSOR_LABELS[rule.sensor] || rule.sensor.toUpperCase();
                        const metric = METRIC_LABELS[rule.metric];
                        if (metric) {
                          return `📊 ${sensor}: ${metric.label} ${rule.operator} ${rule.value}${metric.unit}`;
                        }
                        return `📊 ${sensor} ${rule.operator} ${rule.value}`;
                      })()
                    )}
                    {relay.auto_config.type === 'combined' && `⚡ MULTI-RULE ACTIVE`}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editingRelay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scaleIn">
            <h3 className="text-xl font-bold text-slate-800 mb-4">Edit Relay {editingRelay}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Perangkat</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
                  placeholder="Contoh: Lampu Teras"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Deskripsi</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all h-24 resize-none"
                  placeholder="Deskripsi singkat fungsi perangkat..."
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setEditingRelay(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors"
                disabled={saving}
              >
                Batal
              </button>
              <button
                onClick={handleSaveRelay}
                disabled={saving}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition-colors flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Menyimpan...
                  </>
                ) : (
                  "Simpan"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Automation Modal */}
      {showAutomationModal && (
        <AutomationModal
          relay={showAutomationModal}
          onClose={() => setShowAutomationModal(null)}
          onSave={fetchRelays}
          fetchWithAuth={fetchWithAuth}
          API_BASE_URL={API_BASE_URL}
        />
      )}
    </div>
  );
}
