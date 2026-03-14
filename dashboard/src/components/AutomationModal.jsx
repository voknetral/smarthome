import React, { useState, useEffect } from "react";
import { X, Clock, Zap, Settings2, Save, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * AutomationModal Component
 * Handles the configuration of relay automation rules (Time, Sensor, Combined).
 */
const AutomationModal = ({ relay, onClose, onSave, fetchWithAuth, API_BASE_URL }) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    // Form State
    const [config, setConfig] = useState({
        rule_type: "time", // 'time', 'sensor', 'combined'
        time_config: {
            days: [0, 1, 2, 3, 4, 5, 6],
            start_time: "18:00",
            end_time: "06:00"
        },
        sensor_config: {
            sensor_id: "dht22",
            metric: "temperature",
            operator: ">",
            threshold: 30
        },
        action_on_trigger: "ON"
    });

    const SENSOR_METRICS = {
        dht22: ["temperature", "humidity"],
        mq2: ["smoke", "lpg", "co"],
        pzem004t: ["voltage", "current", "power", "energy"],
        bh1750: ["lux"]
    };

    const DAYS = [
        { id: 0, label: "Min" },
        { id: 1, label: "Sen" },
        { id: 2, label: "Sel" },
        { id: 3, label: "Rab" },
        { id: 4, label: "Kam" },
        { id: 5, label: "Jum" },
        { id: 6, label: "Sab" }
    ];

    const DAY_MAP = {
        0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat'
    };
    const REVERSE_DAY_MAP = Object.fromEntries(Object.entries(DAY_MAP).map(([k, v]) => [v, parseInt(k)]));

    useEffect(() => {
        fetchCurrentConfig();
    }, [relay.id]);

    const fetchCurrentConfig = async () => {
        try {
            setLoading(true);
            const res = await fetchWithAuth(`${API_BASE_URL}/relays/${relay.id}/automation`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.auto_config) {
                    const ac = data.auto_config;
                    const newConfig = {
                        rule_type: ac.type || 'time',
                        time_config: { ...config.time_config },
                        sensor_config: { ...config.sensor_config },
                        action_on_trigger: "ON"
                    };

                    if (ac.time_rules && ac.time_rules.length > 0) {
                        const rule = ac.time_rules[0];
                        // Ensure we map 'mon', 'tue' etc back to 1, 2...
                        // If rule.days is missing, default to empty array
                        const days = rule.days || [];
                        newConfig.time_config = {
                            days: (days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6]).map(d => REVERSE_DAY_MAP[d] ?? 0),
                            start_time: rule.start_time,
                            end_time: rule.end_time
                        };
                        newConfig.action_on_trigger = rule.action ? rule.action.toUpperCase() : "ON";
                    }

                    if (ac.sensor_rules && ac.sensor_rules.length > 0) {
                        const rule = ac.sensor_rules[0];
                        newConfig.sensor_config = {
                            sensor_id: rule.sensor,
                            metric: rule.metric,
                            operator: rule.operator,
                            threshold: rule.value
                        };
                        // Only override action if it wasn't set by time rule (or just take the last one)
                        newConfig.action_on_trigger = rule.action ? rule.action.toUpperCase() : "ON";
                    }

                    setConfig(newConfig);
                }
            }
        } catch (err) {
            console.error("Failed to fetch automation config:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setSuccess(false);

        try {
            // Construct Payload CORRECTLY for Backend Pydantic Models
            const payload = {
                mode: 'auto',
                auto_config: {
                    type: config.rule_type,
                    time_rules: [],
                    sensor_rules: []
                }
            };

            const formatTime = (timeStr) => {
                const parts = timeStr.split(':');
                const h = (parts[0] || '00').padStart(2, '0');
                const m = (parts[1] || '00').padStart(2, '0');
                return `${h}:${m}`;
            };

            const action = config.action_on_trigger.toLowerCase();

            if (config.rule_type === 'time' || config.rule_type === 'combined') {
                payload.auto_config.time_rules.push({
                    id: `timer-${Date.now()}`,
                    days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
                    start_time: formatTime(config.time_config.start_time),
                    end_time: formatTime(config.time_config.end_time),
                    action: action
                });
            }

            if (config.rule_type === 'sensor' || config.rule_type === 'combined') {
                payload.auto_config.sensor_rules.push({
                    id: `sensor-${Date.now()}`,
                    sensor: config.sensor_config.sensor_id,
                    metric: config.sensor_config.metric,
                    operator: config.sensor_config.operator,
                    value: config.sensor_config.threshold,
                    action: action
                });
            }

            const res = await fetchWithAuth(`${API_BASE_URL}/relays/${relay.id}/automation`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json();
                console.error("Server Error Detail:", errData);
                const errorMessage = errData.detail
                    ? (typeof errData.detail === 'object' ? JSON.stringify(errData.detail) : errData.detail)
                    : "Gagal menyimpan konfigurasi";
                throw new Error(errorMessage);
            }

            setSuccess(true);
            setTimeout(() => {
                onSave();
                onClose();
            }, 1500);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };



    if (loading) {
        return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm">
                <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                    <div className="flex items-center justify-center p-12">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500 border-t-transparent"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/20 p-4 backdrop-blur-sm">
            <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-slate-200">
                {/* Header */}
                <div className="relative border-b border-slate-100 p-4 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
                                <Settings2 size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">Otomatisasi {relay.name}</h3>
                                <p className="text-xs text-slate-500">Konfigurasi aturan otomatis</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="p-4">
                    {error && (
                        <div className="mb-6 flex items-center gap-3 rounded-xl bg-red-50 p-4 text-red-600 border border-red-100">
                            <AlertCircle size={20} />
                            <p className="text-sm">{error}</p>
                        </div>
                    )}

                    {success && (
                        <div className="mb-6 flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-600 border border-emerald-100">
                            <CheckCircle2 size={20} />
                            <p className="text-sm">Konfigurasi berhasil disimpan!</p>
                        </div>
                    )}

                    <div className="space-y-4">
                        {/* Rule Type Selection */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-slate-700">Tipe Aturan</label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: "time", icon: Clock, label: "Waktu" },
                                    { id: "sensor", icon: Zap, label: "Sensor" }
                                ].map((type) => (
                                    <button
                                        key={type.id}
                                        type="button"
                                        onClick={() => setConfig({ ...config, rule_type: type.id })}
                                        className={`flex flex-col items-center gap-2 rounded-xl p-3 transition-all ${config.rule_type === type.id
                                            ? "bg-teal-50 text-teal-700 shadow-sm ring-1 ring-teal-500/30"
                                            : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                                            }`}
                                    >
                                        <type.icon size={22} />
                                        <span className="text-sm font-bold">{type.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Time Configuration Section */}
                        {(config.rule_type === "time" || config.rule_type === "combined") && (
                            <div className="space-y-4 rounded-2xl bg-slate-50/50 p-5 ring-1 ring-slate-200/50">
                                <div className="flex items-center gap-2 text-teal-600">
                                    <Clock size={18} />
                                    <span className="text-sm font-semibold uppercase tracking-wider">Aturan Waktu</span>
                                </div>



                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Mulai (24 Jam)</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                maxLength="2"
                                                placeholder="HH"
                                                value={config.time_config.start_time.split(':')[0] || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                                                    const m = config.time_config.start_time.split(':')[1] || '00';
                                                    setConfig({ ...config, time_config: { ...config.time_config, start_time: `${val}:${m}` } });
                                                }}
                                                onBlur={(e) => {
                                                    const h = e.target.value.padStart(2, '0');
                                                    const m = config.time_config.start_time.split(':')[1] || '00';
                                                    setConfig({ ...config, time_config: { ...config.time_config, start_time: `${h}:${m}` } });
                                                }}
                                                className="w-full rounded-lg bg-white px-3 py-2.5 text-center text-slate-800 focus:ring-1 focus:ring-teal-500 outline-none shadow-sm"
                                            />
                                            <span className="font-bold text-slate-400">:</span>
                                            <input
                                                type="text"
                                                maxLength="2"
                                                placeholder="MM"
                                                value={config.time_config.start_time.split(':')[1] || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                                                    const h = config.time_config.start_time.split(':')[0] || '00';
                                                    setConfig({ ...config, time_config: { ...config.time_config, start_time: `${h}:${val}` } });
                                                }}
                                                onBlur={(e) => {
                                                    const h = config.time_config.start_time.split(':')[0] || '00';
                                                    const m = e.target.value.padStart(2, '0');
                                                    setConfig({ ...config, time_config: { ...config.time_config, start_time: `${h}:${m}` } });
                                                }}
                                                className="w-full rounded-lg bg-white px-3 py-2.5 text-center text-slate-800 focus:ring-1 focus:ring-teal-500 outline-none shadow-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Selesai (24 Jam)</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                maxLength="2"
                                                placeholder="HH"
                                                value={config.time_config.end_time.split(':')[0] || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                                                    const m = config.time_config.end_time.split(':')[1] || '00';
                                                    setConfig({ ...config, time_config: { ...config.time_config, end_time: `${val}:${m}` } });
                                                }}
                                                onBlur={(e) => {
                                                    const h = e.target.value.padStart(2, '0');
                                                    const m = config.time_config.end_time.split(':')[1] || '00';
                                                    setConfig({ ...config, time_config: { ...config.time_config, end_time: `${h}:${m}` } });
                                                }}
                                                className="w-full rounded-lg bg-white px-3 py-2.5 text-center text-slate-800 focus:ring-1 focus:ring-teal-500 outline-none shadow-sm"
                                            />
                                            <span className="font-bold text-slate-400">:</span>
                                            <input
                                                type="text"
                                                maxLength="2"
                                                placeholder="MM"
                                                value={config.time_config.end_time.split(':')[1] || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
                                                    const h = config.time_config.end_time.split(':')[0] || '00';
                                                    setConfig({ ...config, time_config: { ...config.time_config, end_time: `${h}:${val}` } });
                                                }}
                                                onBlur={(e) => {
                                                    const h = config.time_config.end_time.split(':')[0] || '00';
                                                    const m = e.target.value.padStart(2, '0');
                                                    setConfig({ ...config, time_config: { ...config.time_config, end_time: `${h}:${m}` } });
                                                }}
                                                className="w-full rounded-lg bg-white px-3 py-2.5 text-center text-slate-800 focus:ring-1 focus:ring-teal-500 outline-none shadow-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Sensor Configuration Section */}
                        {(config.rule_type === "sensor" || config.rule_type === "combined") && (
                            <div className="space-y-4 rounded-2xl bg-slate-50/50 p-4 ring-1 ring-slate-200/50">
                                <div className="flex items-center gap-2 text-cyan-600">
                                    <Zap size={18} />
                                    <span className="text-sm font-semibold uppercase tracking-wider">Aturan Sensor</span>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Pilih Sensor</label>
                                        <select
                                            value={config.sensor_config.sensor_id}
                                            onChange={(e) => setConfig({
                                                ...config,
                                                sensor_config: {
                                                    ...config.sensor_config,
                                                    sensor_id: e.target.value,
                                                    metric: SENSOR_METRICS[e.target.value][0]
                                                }
                                            })}
                                            className="w-full rounded-lg bg-white px-3 py-2.5 text-slate-800 focus:ring-1 focus:ring-cyan-500 outline-none shadow-sm"
                                        >
                                            <option value="dht22">DHT22 (Temp/Hum)</option>
                                            <option value="mq2">MQ2 (Gas/Smoke)</option>
                                            <option value="pzem004t">PZEM (Listrik)</option>
                                            <option value="bh1750">BH1750 (Cahaya/Lux)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Metrik</label>
                                        <select
                                            value={config.sensor_config.metric}
                                            onChange={(e) => setConfig({
                                                ...config,
                                                sensor_config: { ...config.sensor_config, metric: e.target.value }
                                            })}
                                            className="w-full rounded-lg bg-white px-3 py-2.5 text-slate-800 focus:ring-1 focus:ring-cyan-500 outline-none shadow-sm"
                                        >
                                            {SENSOR_METRICS[config.sensor_config.sensor_id].map(m => (
                                                <option key={m} value={m}>
                                                    {m.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Operator</label>
                                        <select
                                            value={config.sensor_config.operator}
                                            onChange={(e) => setConfig({
                                                ...config,
                                                sensor_config: { ...config.sensor_config, operator: e.target.value }
                                            })}
                                            className="w-full rounded-lg bg-white px-3 py-2.5 text-slate-800 focus:ring-1 focus:ring-cyan-500 outline-none shadow-sm"
                                        >
                                            <option value=">">Lebih Dari (&gt;)</option>
                                            <option value="<">Kurang Dari (&lt;)</option>
                                            <option value="==">Sama Dengan (==)</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Ambang Batas</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={config.sensor_config.threshold}
                                            onChange={(e) => setConfig({
                                                ...config,
                                                sensor_config: { ...config.sensor_config, threshold: parseFloat(e.target.value) }
                                            })}
                                            className="w-full rounded-lg bg-white px-3 py-2.5 text-slate-800 focus:ring-1 focus:ring-cyan-500 outline-none shadow-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}


                    </div>

                    {/* Footer Actions */}
                    <div className="mt-6 flex gap-3">
                        <button
                            type="submit"
                            disabled={saving}
                            className="group relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl bg-teal-600 py-3 font-bold text-white transition-all hover:bg-teal-500 active:scale-95 disabled:opacity-50 shadow-lg shadow-teal-500/20"
                        >
                            {saving ? (
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                            ) : (
                                <>
                                    <Save size={20} className="group-hover:scale-110 transition-transform" />
                                    <span>SIMPAN KONFIGURASI</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AutomationModal;
