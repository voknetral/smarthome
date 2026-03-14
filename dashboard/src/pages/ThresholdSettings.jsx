import { useState, useEffect } from "react";
import { useMqtt } from "../context/MqttContext";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../config";
import CollapsibleSection from "../components/CollapsibleSection";

export default function ThresholdSettings() {
    const { fetchWithAuth } = useAuth();
    const { settings, updateSettings, DEFAULT_SETTINGS, sensorData } = useMqtt();
    const [thresholdData, setThresholdData] = useState({
        thresholds: settings.thresholds || DEFAULT_SETTINGS.thresholds || {},
        enableThresholds: settings.enableThresholds !== undefined ? settings.enableThresholds : true,
        alertCooldown: settings.alertCooldown || 300,
        telegramConfig: settings.telegramConfig || { bot_token: "", chat_id: "", enabled: false }

    });

    const [isLoadingSettings, setIsLoadingSettings] = useState(false);
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [saved, setSaved] = useState(false);
    const [savedType, setSavedType] = useState("");
    const [validationError, setValidationError] = useState("");
    const [showThresholdResetModal, setShowThresholdResetModal] = useState(false);



    const [expandedSections, setExpandedSections] = useState({

        telegram: false,
        dht22: true,
        mq2: false,
        pzem: false,
        bh1750: false
    });

    const toggleSection = (section) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    useEffect(() => {
        fetchThresholdSettings();
    }, []);

    const fetchThresholdSettings = async () => {
        setIsLoadingSettings(true);
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/settings`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.settings) {
                    const fetchedData = {
                        thresholds: {
                            ...(DEFAULT_SETTINGS.thresholds || {}),
                            ...(data.settings.thresholds || {})
                        },
                        enableThresholds: data.settings.enable_thresholds ?? true,
                        alertCooldown: data.settings.alert_cooldown || 300,
                        telegramConfig: data.settings.telegram_config || { bot_token: "", chat_id: "", enabled: false }
                    };
                    setThresholdData(fetchedData);
                    updateSettings(fetchedData);
                }
            }
        } catch (err) {
            console.error("Failed to fetch settings:", err);
        } finally {
            setIsLoadingSettings(false);
        }
    };

    const handleThresholdChange = (sensor, field, value) => {
        setThresholdData((prev) => ({
            ...prev,
            thresholds: {
                ...prev.thresholds,
                [sensor]: {
                    ...prev.thresholds[sensor],
                    [field]: value === "" ? "" : parseFloat(value),
                },
            },
        }));
    };

    const validateThresholds = () => {
        const t = thresholdData.thresholds;
        const errors = [];
        if (t.dht22) {
            if (t.dht22.tempMin !== "" && t.dht22.tempMax !== "" && Number(t.dht22.tempMin) > Number(t.dht22.tempMax)) errors.push("Suhu Min > Suhu Max");
            if (t.dht22.humMin !== "" && t.dht22.humMax !== "" && Number(t.dht22.humMin) > Number(t.dht22.humMax)) errors.push("Kelembaban Min > Kelembaban Max");
        }
        if (t.mq2) {
            if (t.mq2.smokeWarn !== "" && t.mq2.smokeMax !== "" && Number(t.mq2.smokeWarn) > Number(t.mq2.smokeMax)) errors.push("MQ2: Smoke (est.) Waspada > Smoke Bahaya");
            if (t.mq2.lpgWarn !== "" && t.mq2.lpgMax !== "" && Number(t.mq2.lpgWarn) > Number(t.mq2.lpgMax)) errors.push("MQ2: LPG (est.) Waspada > LPG Bahaya");
            if (t.mq2.coWarn !== "" && t.mq2.coMax !== "" && Number(t.mq2.coWarn) > Number(t.mq2.coMax)) errors.push("MQ2: CO (est.) Waspada > CO Bahaya");
        }
        if (t.pzem004t) {
            if (t.pzem004t.voltageMin !== "" && t.pzem004t.voltageMax !== "" && Number(t.pzem004t.voltageMin) > Number(t.pzem004t.voltageMax)) errors.push("PZEM: Tegangan Min > Tegangan Max");
            if (t.pzem004t.freqMin !== "" && t.pzem004t.freqMax !== "" && Number(t.pzem004t.freqMin) > Number(t.pzem004t.freqMax)) errors.push("PZEM: Frekuensi Min > Frekuensi Max");
            if (t.pzem004t.powerMax !== "" && Number(t.pzem004t.powerMax) < 0) errors.push("PZEM: Daya Max tidak boleh negatif");
            if (t.pzem004t.currentMax !== "" && Number(t.pzem004t.currentMax) < 0) errors.push("PZEM: Arus Max tidak boleh negatif");
            if (t.pzem004t.energyMax !== "" && Number(t.pzem004t.energyMax) < 0) errors.push("PZEM: Energi Max tidak boleh negatif");
            if (t.pzem004t.pfMin !== "" && (Number(t.pzem004t.pfMin) < 0 || Number(t.pzem004t.pfMin) > 1)) errors.push("PZEM: Power Factor harus antara 0-1");
        }
        if (t.bh1750) {
            if (t.bh1750.luxMin !== "" && t.bh1750.luxMax !== "" && Number(t.bh1750.luxMin) > Number(t.bh1750.luxMax)) errors.push("BH1750: Cahaya Min > Cahaya Max");
        }
        return errors;
    };

    const handleThresholdSubmit = async (e) => {
        e.preventDefault();
        const errors = validateThresholds();
        if (errors.length > 0) {
            setValidationError(errors.join("; "));
            return;
        }

        setIsSavingSettings(true);
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/settings`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    thresholds: thresholdData.thresholds,
                    enable_thresholds: thresholdData.enableThresholds,
                    alert_cooldown: parseInt(thresholdData.alertCooldown),
                    telegram_config: thresholdData.telegramConfig
                }),
            });

            if (res.ok) {
                updateSettings({
                    thresholds: thresholdData.thresholds,
                    enableThresholds: thresholdData.enableThresholds,
                    alertCooldown: thresholdData.alertCooldown,
                    telegramConfig: thresholdData.telegramConfig
                });
                setSavedType("threshold");
                setSaved(true);
                setTimeout(() => {
                    setSaved(false);
                    window.location.reload();
                }, 800);
            }
        } catch (err) {
            setValidationError("Gagal menyimpan ke server");
        } finally {
            setIsSavingSettings(false);
        }
    };

    const confirmThresholdReset = async () => {
        setIsSavingSettings(true);
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/settings/reset`, {
                method: "POST"
            });
            if (res.ok) {
                const data = await res.json();
                const resetData = {
                    thresholds: data.thresholds,
                    enableThresholds: data.enable_thresholds ?? false,
                    alertCooldown: data.alert_cooldown || 300,
                    telegramConfig: data.telegram_config || { bot_token: "", chat_id: "", enabled: false }
                };
                setThresholdData(resetData);
                updateSettings(resetData);
                setSavedType("threshold");
                setSaved(true);
                setTimeout(() => {
                    setSaved(false);
                    window.location.reload();
                }, 800);
            }
        } catch (err) {
            setValidationError("Gagal mereset");
        } finally {
            setIsSavingSettings(false);
            setShowThresholdResetModal(false);
        }
    };



    const [isTestLoading, setIsTestLoading] = useState(false);
    const handleTelegramTest = async () => {
        if (!thresholdData.telegramConfig.bot_token || !thresholdData.telegramConfig.chat_id) {
            setValidationError("Isi Bot Token dan Chat ID untuk test");
            return;
        }
        setIsTestLoading(true);
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/notify/telegram/test`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    bot_token: thresholdData.telegramConfig.bot_token,
                    chat_id: thresholdData.telegramConfig.chat_id
                }),
            });
            const data = await res.json();
            if (data.success) {
                setSavedType("telegram_test");
                setSaved(true);
                setTimeout(() => setSaved(false), 3000);
            }
        } catch (err) {
            setValidationError("Error koneksi server");
        } finally {
            setIsTestLoading(false);
        }
    };

    const handleEnableThresholdsToggle = async (newValue) => {
        setIsSavingSettings(true);
        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/settings`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    thresholds: thresholdData.thresholds,
                    enable_thresholds: newValue,
                    alert_cooldown: parseInt(thresholdData.alertCooldown),
                    telegram_config: thresholdData.telegramConfig
                }),
            });

            if (res.ok) {
                updateSettings({
                    thresholds: thresholdData.thresholds,
                    enableThresholds: newValue,
                    alertCooldown: thresholdData.alertCooldown,
                    telegramConfig: thresholdData.telegramConfig
                });
                setThresholdData(prev => ({ ...prev, enableThresholds: newValue }));
                setSavedType("notification_toggle");
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
            } else {
                setThresholdData(prev => ({ ...prev, enableThresholds: !newValue })); // Revert UI on error
                setValidationError("Gagal mengubah status notifikasi");
            }
        } catch (err) {
            setThresholdData(prev => ({ ...prev, enableThresholds: !newValue })); // Revert UI on error
            setValidationError("Gagal mengubah status notifikasi");
        } finally {
            setIsSavingSettings(false);
        }
    };


    return (
        <div className="page-section">
            <div className="mb-8 space-y-2">
                <h2 className="text-3xl font-bold text-slate-800">Pengaturan Threshold</h2>
                <p className="text-slate-600 text-sm">Konfigurasi batas nilai sensor untuk notifikasi peringatan sistem</p>
            </div>

            <div className="bg-white p-6 md:p-8 rounded-xl shadow-sm border border-slate-100/50">
                {isLoadingSettings ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                    </div>
                ) : (
                    <form className="space-y-6" onSubmit={handleThresholdSubmit}>
                        <div className="mb-6 flex gap-4 bg-slate-50 p-4 rounded-xl items-center justify-between border border-slate-100/50">
                            <div>
                                <h4 className="text-sm font-semibold text-slate-700">Notifikasi Sistem</h4>
                                <p className="text-xs text-slate-500">Aktifkan atau nonaktifkan semua peringatan.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={thresholdData.enableThresholds}
                                    onChange={(e) => handleEnableThresholdsToggle(e.target.checked)}
                                />
                                <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-teal-300 peer-checked:bg-teal-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                            </label>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100/50 space-y-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-700">Cooldown Notifikasi (Detik)</h4>
                                    <p className="text-xs text-slate-500">Jeda waktu minimal antar notifikasi yang sama.</p>
                                </div>
                                <div className="w-24">
                                    <input
                                        type="number"
                                        min="10"
                                        value={thresholdData.alertCooldown}
                                        onChange={(e) => setThresholdData(prev => ({ ...prev, alertCooldown: e.target.value }))}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-teal-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>



                        <div className={!thresholdData.enableThresholds ? 'opacity-50 pointer-events-none' : ''}>
                            <CollapsibleSection title="Notifikasi Telegram" isOpen={expandedSections.telegram} onToggle={() => toggleSection('telegram')}>
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-sm font-medium text-slate-700">Status Aktif</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" className="sr-only peer" checked={thresholdData.telegramConfig?.enabled || false} onChange={(e) => setThresholdData(prev => ({ ...prev, telegramConfig: { ...prev.telegramConfig, enabled: e.target.checked } }))} />
                                        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:bg-teal-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                                    </label>
                                </div>
                                {thresholdData.telegramConfig?.enabled && (
                                    <div className="space-y-4">
                                        <input type="text" value={thresholdData.telegramConfig?.bot_token || ""} onChange={(e) => setThresholdData(prev => ({ ...prev, telegramConfig: { ...prev.telegramConfig, bot_token: e.target.value } }))} placeholder="Bot Token" className="w-full px-4 py-3 border border-teal-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 transition-all outline-none bg-white" />
                                        <div className="flex gap-2">
                                            <input type="text" value={thresholdData.telegramConfig?.chat_id || ""} onChange={(e) => setThresholdData(prev => ({ ...prev, telegramConfig: { ...prev.telegramConfig, chat_id: e.target.value } }))} placeholder="Chat ID" className="w-full px-4 py-3 border border-teal-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 transition-all outline-none bg-white" />
                                            <button type="button" onClick={handleTelegramTest} className="px-6 py-3 bg-teal-50 text-teal-700 hover:bg-teal-100 rounded-lg text-sm font-bold transition-colors">{isTestLoading ? "..." : "Test"}</button>
                                        </div>
                                    </div>
                                )}
                            </CollapsibleSection>

                            <CollapsibleSection title="DHT22 (Suhu & Kelembaban)" isOpen={expandedSections.dht22} onToggle={() => toggleSection('dht22')} color="bg-blue-500">
                                <div className="space-y-6">
                                    {/* Current Values Card */}
                                    {sensorData?.dht22 && (
                                        <div className="bg-gradient-to-r from-blue-50 to-blue-100/50 p-4 rounded-xl border border-blue-200/50 backdrop-blur-sm">
                                            <p className="text-xs font-bold text-blue-600 mb-3 uppercase tracking-wider">Nilai Saat Ini</p>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-1">
                                                        <p className="text-xs text-blue-600 font-medium">Suhu</p>
                                                        <p className="text-xl font-bold text-blue-900">{(sensorData.dht22.temp[sensorData.dht22.temp.length - 1] ?? 0).toFixed(1)}°C</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-1">
                                                        <p className="text-xs text-blue-600 font-medium">Kelembaban</p>
                                                        <p className="text-xl font-bold text-blue-900">{(sensorData.dht22.hum[sensorData.dht22.hum.length - 1] ?? 0).toFixed(1)}%</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                                            <div className="flex items-center gap-2 border-b border-blue-200 pb-2">
                                                <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.3A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z" />
                                                </svg>
                                                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-tight">Suhu (°C)</h4>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">Batas Maksimal</label>
                                                    <input type="number" step="0.1" value={thresholdData.thresholds.dht22?.tempMax ?? ""} onChange={(e) => handleThresholdChange("dht22", "tempMax", e.target.value)} className="w-full border-2 border-blue-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 transition-all outline-none bg-white" placeholder="30" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">Batas Minimal</label>
                                                    <input type="number" step="0.1" value={thresholdData.thresholds.dht22?.tempMin ?? ""} onChange={(e) => handleThresholdChange("dht22", "tempMin", e.target.value)} className="w-full border-2 border-blue-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 transition-all outline-none bg-white" placeholder="15" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                                            <div className="flex items-center gap-2 border-b border-blue-200 pb-2">
                                                <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                                                </svg>
                                                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-tight">Kelembaban (%)</h4>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">Batas Maksimal</label>
                                                    <input type="number" value={thresholdData.thresholds.dht22?.humMax ?? ""} onChange={(e) => handleThresholdChange("dht22", "humMax", e.target.value)} className="w-full border-2 border-blue-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 transition-all outline-none bg-white" placeholder="80" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">Batas Minimal</label>
                                                    <input type="number" value={thresholdData.thresholds.dht22?.humMin ?? ""} onChange={(e) => handleThresholdChange("dht22", "humMin", e.target.value)} className="w-full border-2 border-blue-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 transition-all outline-none bg-white" placeholder="30" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CollapsibleSection>

                            <CollapsibleSection title="MQ2 (Kualitas Udara)" isOpen={expandedSections.mq2} onToggle={() => toggleSection('mq2')} color="bg-orange-500">
                                <div className="space-y-6">
                                    {/* Current Values Card */}
                                    {sensorData?.mq2 && (
                                        <div className="bg-gradient-to-r from-orange-50 to-orange-100/50 p-4 rounded-xl border border-orange-200/50 backdrop-blur-sm">
                                            <p className="text-xs font-bold text-orange-600 mb-3 uppercase tracking-wider">Nilai Saat Ini</p>
                                            <div className="grid grid-cols-3 gap-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-1">
                                                        <p className="text-xs text-orange-600 font-medium">Asap</p>
                                                        <p className="text-lg font-bold text-orange-900">{(sensorData.mq2.smoke[sensorData.mq2.smoke.length - 1] ?? 0).toFixed(0)} ppm</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-1">
                                                        <p className="text-xs text-orange-600 font-medium">LPG</p>
                                                        <p className="text-lg font-bold text-orange-900">{(sensorData.mq2.lpg[sensorData.mq2.lpg.length - 1] ?? 0).toFixed(0)} ppm</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-1">
                                                        <p className="text-xs text-orange-600 font-medium">CO</p>
                                                        <p className="text-lg font-bold text-orange-900">{(sensorData.mq2.co[sensorData.mq2.co.length - 1] ?? 0).toFixed(0)} ppm</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                                            <div className="flex items-center gap-2 border-b border-orange-200 pb-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-orange-400"></div>
                                                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-tight">Asap (est. ppm)</h4>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">Bahaya</label>
                                                    <input type="number" value={thresholdData.thresholds.mq2?.smokeMax ?? ""} onChange={(e) => handleThresholdChange("mq2", "smokeMax", e.target.value)} className="w-full border-2 border-orange-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-orange-500 transition-all outline-none bg-white" placeholder="500" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">Waspada</label>
                                                    <input type="number" value={thresholdData.thresholds.mq2?.smokeWarn ?? ""} onChange={(e) => handleThresholdChange("mq2", "smokeWarn", e.target.value)} className="w-full border-2 border-orange-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-orange-500 transition-all outline-none bg-white" placeholder="350" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                                            <div className="flex items-center gap-2 border-b border-orange-200 pb-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-orange-400"></div>
                                                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-tight">LPG (est. ppm)</h4>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">Bahaya</label>
                                                    <input type="number" value={thresholdData.thresholds.mq2?.lpgMax ?? ""} onChange={(e) => handleThresholdChange("mq2", "lpgMax", e.target.value)} className="w-full border-2 border-orange-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-orange-500 transition-all outline-none bg-white" placeholder="1000" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">Waspada</label>
                                                    <input type="number" value={thresholdData.thresholds.mq2?.lpgWarn ?? ""} onChange={(e) => handleThresholdChange("mq2", "lpgWarn", e.target.value)} className="w-full border-2 border-orange-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-orange-500 transition-all outline-none bg-white" placeholder="500" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                                            <div className="flex items-center gap-2 border-b border-orange-200 pb-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-orange-400"></div>
                                                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-tight">CO (est. ppm)</h4>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">Bahaya</label>
                                                    <input type="number" value={thresholdData.thresholds.mq2?.coMax ?? ""} onChange={(e) => handleThresholdChange("mq2", "coMax", e.target.value)} className="w-full border-2 border-orange-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-orange-500 transition-all outline-none bg-white" placeholder="500" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">Waspada</label>
                                                    <input type="number" value={thresholdData.thresholds.mq2?.coWarn ?? ""} onChange={(e) => handleThresholdChange("mq2", "coWarn", e.target.value)} className="w-full border-2 border-orange-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-orange-500 transition-all outline-none bg-white" placeholder="200" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CollapsibleSection>

                            <CollapsibleSection title="PZEM004T (Monitor Listrik)" isOpen={expandedSections.pzem} onToggle={() => toggleSection('pzem')} color="bg-yellow-500">
                                <div className="space-y-6">
                                    {/* Current Values Card */}
                                    {sensorData?.pzem004t && (
                                        <div className="bg-gradient-to-r from-yellow-50 to-yellow-100/50 p-4 rounded-xl border border-yellow-200/50 backdrop-blur-sm">
                                            <p className="text-xs font-bold text-yellow-600 mb-3 uppercase tracking-wider">Nilai Saat Ini</p>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div>
                                                    <p className="text-xs text-yellow-600 font-medium">Tegangan</p>
                                                    <p className="text-lg font-bold text-yellow-900">{(sensorData.pzem004t.voltage[sensorData.pzem004t.voltage.length - 1] ?? 0).toFixed(1)} V</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-yellow-600 font-medium">Arus</p>
                                                    <p className="text-lg font-bold text-yellow-900">{(sensorData.pzem004t.current[sensorData.pzem004t.current.length - 1] ?? 0).toFixed(2)} A</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-yellow-600 font-medium">Daya</p>
                                                    <p className="text-lg font-bold text-yellow-900">{(sensorData.pzem004t.power[sensorData.pzem004t.power.length - 1] ?? 0).toFixed(0)} W</p>
                                                </div>
                                                <div>
                                                    <p className="text-xs text-yellow-600 font-medium">Energi</p>
                                                    <p className="text-lg font-bold text-yellow-900">{(sensorData.pzem004t.energy[sensorData.pzem004t.energy.length - 1] ?? 0).toFixed(2)} kWh</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                                            <label className="block text-xs font-bold text-slate-500 ml-1">Tegangan Max (V)</label>
                                            <input type="number" value={thresholdData.thresholds.pzem004t?.voltageMax ?? ""} onChange={(e) => handleThresholdChange("pzem004t", "voltageMax", e.target.value)} className="w-full border-2 border-yellow-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-yellow-500 transition-all outline-none bg-white" placeholder="260" />
                                        </div>
                                        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                                            <label className="block text-xs font-bold text-slate-500 ml-1">Tegangan Min (V)</label>
                                            <input type="number" value={thresholdData.thresholds.pzem004t?.voltageMin ?? ""} onChange={(e) => handleThresholdChange("pzem004t", "voltageMin", e.target.value)} className="w-full border-2 border-yellow-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-yellow-500 transition-all outline-none bg-white" placeholder="180" />
                                        </div>
                                        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                                            <label className="block text-xs font-bold text-slate-500 ml-1">Daya Max (W)</label>
                                            <input type="number" value={thresholdData.thresholds.pzem004t?.powerMax ?? ""} onChange={(e) => handleThresholdChange("pzem004t", "powerMax", e.target.value)} className="w-full border-2 border-yellow-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-yellow-500 transition-all outline-none bg-white" placeholder="5000" />
                                        </div>
                                        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                                            <label className="block text-xs font-bold text-slate-500 ml-1">Arus Max (A)</label>
                                            <input type="number" step="0.1" value={thresholdData.thresholds.pzem004t?.currentMax ?? ""} onChange={(e) => handleThresholdChange("pzem004t", "currentMax", e.target.value)} className="w-full border-2 border-yellow-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-yellow-500 transition-all outline-none bg-white" placeholder="20" />
                                        </div>
                                        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                                            <label className="block text-xs font-bold text-slate-500 ml-1">Energi Max (kWh)</label>
                                            <input type="number" value={thresholdData.thresholds.pzem004t?.energyMax ?? ""} onChange={(e) => handleThresholdChange("pzem004t", "energyMax", e.target.value)} className="w-full border-2 border-yellow-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-yellow-500 transition-all outline-none bg-white" placeholder="999999" />
                                        </div>
                                        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                                            <label className="block text-xs font-bold text-slate-500 ml-1">Power Factor Min</label>
                                            <input type="number" step="0.01" value={thresholdData.thresholds.pzem004t?.pfMin ?? ""} onChange={(e) => handleThresholdChange("pzem004t", "pfMin", e.target.value)} className="w-full border-2 border-yellow-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-yellow-500 transition-all outline-none bg-white" placeholder="0.8" />
                                        </div>
                                        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                                            <label className="block text-xs font-bold text-slate-500 ml-1">Frekuensi Max (Hz)</label>
                                            <input type="number" step="0.1" value={thresholdData.thresholds.pzem004t?.freqMax ?? ""} onChange={(e) => handleThresholdChange("pzem004t", "freqMax", e.target.value)} className="w-full border-2 border-yellow-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-yellow-500 transition-all outline-none bg-white" placeholder="52" />
                                        </div>
                                        <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                                            <label className="block text-xs font-bold text-slate-500 ml-1">Frekuensi Min (Hz)</label>
                                            <input type="number" step="0.1" value={thresholdData.thresholds.pzem004t?.freqMin ?? ""} onChange={(e) => handleThresholdChange("pzem004t", "freqMin", e.target.value)} className="w-full border-2 border-yellow-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-yellow-500 transition-all outline-none bg-white" placeholder="48" />
                                        </div>
                                    </div>
                                </div>
                            </CollapsibleSection>

                            <CollapsibleSection title="BH1750 (Intensitas Cahaya)" isOpen={expandedSections.bh1750} onToggle={() => toggleSection('bh1750')} color="bg-yellow-400">
                                <div className="space-y-6">
                                    {/* Current Value Card */}
                                    {sensorData?.bh1750 && (
                                        <div className="bg-gradient-to-r from-amber-50 to-yellow-100/50 p-4 rounded-xl border border-yellow-200/50 backdrop-blur-sm">
                                            <p className="text-xs font-bold text-amber-600 mb-3 uppercase tracking-wider">Nilai Saat Ini</p>
                                            <div className="flex items-center gap-4">
                                                <div>
                                                    <p className="text-xs text-amber-600 font-medium">Intensitas Cahaya</p>
                                                    <p className="text-2xl font-bold text-amber-900">{(sensorData.bh1750.lux[sensorData.bh1750.lux.length - 1] ?? 0).toFixed(0)}</p>
                                                    <p className="text-xs text-amber-600">lux</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                                            <div className="flex items-center gap-2 border-b border-yellow-200 pb-2">
                                                <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.343a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM16.364 15.657a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM11 15a1 1 0 10-2 0v1a1 1 0 102 0v-1zM4.343 15.657l-.707.707a1 1 0 001.414 1.414l.707-.707a1 1 0 00-1.414-1.414zM4 10a1 1 0 01-1-1V8a1 1 0 012 0v1a1 1 0 01-1 1zM4.343 4.343l-.707-.707A1 1 0 102.222 5.05l.707-.707a1 1 0 011.414-1.414zM10 5a5 5 0 110 10 5 5 0 010-10z" />
                                                </svg>
                                                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-tight">Cahaya (Lux)</h4>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">Batas Maksimal</label>
                                                    <input type="number" value={thresholdData.thresholds.bh1750?.luxMax ?? ""} onChange={(e) => handleThresholdChange("bh1750", "luxMax", e.target.value)} className="w-full border-2 border-yellow-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-yellow-500 transition-all outline-none bg-white" placeholder="100000" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-2 ml-1">Batas Minimal</label>
                                                    <input type="number" value={thresholdData.thresholds.bh1750?.luxMin ?? ""} onChange={(e) => handleThresholdChange("bh1750", "luxMin", e.target.value)} className="w-full border-2 border-yellow-200 p-3 rounded-lg text-sm font-medium focus:ring-2 focus:ring-yellow-500 transition-all outline-none bg-white" placeholder="0" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-4 bg-blue-50 p-4 rounded-xl border border-blue-200/50">
                                            <div className="flex items-center gap-2 border-b border-blue-200 pb-2">
                                                <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a6 6 0 00-9-5.666V12a4 4 0 010-8h.003a6.001 6.001 0 015.888-1.059 3 3 0 015.883.7A4 4 0 1116 18z" />
                                                </svg>
                                                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-tight">Info</h4>
                                            </div>
                                            <div className="space-y-2 text-sm text-slate-600">
                                                <p>📊 <strong>Rekomendasi nilai:</strong></p>
                                                <ul className="list-disc list-inside space-y-1 ml-2 text-xs">
                                                    <li>Malam (Gelap): 0-100 lux</li>
                                                    <li>Ruang dalam: 100-1000 lux</li>
                                                    <li>Ruang terang: 1000-10000 lux</li>
                                                    <li>Outdoor siang: 10000-100000 lux</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CollapsibleSection>
                        </div>

                        {validationError && (
                            <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm border border-red-200 flex items-start gap-3">
                                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                                <span>{validationError}</span>
                            </div>
                        )}
                        {saved && savedType === "threshold" && (
                            <div className="p-4 bg-green-50 text-green-700 rounded-xl text-sm border border-green-200 flex items-start gap-3">
                                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                <span>✓ Threshold berhasil disimpan!</span>
                            </div>
                        )}

                        {saved && savedType === "notification_toggle" && (
                            <div className="p-4 bg-green-50 text-green-700 rounded-xl text-sm border border-green-200 flex items-start gap-3">
                                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                <span>✓ Status notifikasi berhasil diubah!</span>
                            </div>
                        )}
                        {saved && savedType === "telegram_test" && (
                            <div className="p-4 bg-green-50 text-green-700 rounded-xl text-sm border border-green-200 flex items-start gap-3">
                                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                <span>✓ Pesan test Telegram berhasil dikirim!</span>
                            </div>
                        )}

                        <div className="flex flex-col md:flex-row justify-end gap-3 pt-8 border-t border-slate-100/50">
                            <button
                                type="button"
                                onClick={() => setShowThresholdResetModal(true)}
                                className="order-2 md:order-1 group relative px-8 py-3.5 bg-white border-2 border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 hover:border-slate-300 hover:text-slate-700 active:scale-[0.97] transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Reset ke Default
                            </button>

                            <button
                                type="submit"
                                disabled={isSavingSettings}
                                className="order-1 md:order-2 group relative px-8 py-3.5 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white font-bold rounded-xl transition-all duration-300 shadow-xl shadow-teal-500/30 hover:shadow-teal-500/50 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
                            >
                                {isSavingSettings ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>Menyimpan...</span>
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span>Simpan Perubahan</span>
                                    </>
                                )}
                            </button>

                            {showThresholdResetModal && (
                                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all duration-300 animate-in fade-in">
                                    <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl border border-slate-100 transform transition-all scale-100">
                                        <div className="flex flex-col items-center text-center space-y-4">
                                            {/* Warning Icon Container */}
                                            <div className="w-16 h-16 bg-gradient-to-br from-amber-50 to-orange-100 rounded-2xl flex items-center justify-center text-amber-500 mb-2 shadow-lg shadow-amber-500/20">
                                                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                            </div>

                                            <div>
                                                <h3 className="text-2xl font-bold text-slate-800">Mereset Threshold?</h3>
                                                <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                                                    Semua konfigurasi batas sensor akan dikembalikan ke setelan awal pabrik. Tindakan ini <strong>tidak dapat dibatalkan</strong>.
                                                </p>
                                            </div>

                                            <div className="flex flex-col w-full gap-3 pt-6">
                                                <button
                                                    onClick={confirmThresholdReset}
                                                    className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-xl shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 hover:scale-[1.02] active:scale-95 transition-all duration-200 flex items-center justify-center gap-2"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                    </svg>
                                                    Ya, Reset Sekarang
                                                </button>
                                                <button
                                                    onClick={() => setShowThresholdResetModal(false)}
                                                    className="w-full py-3.5 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 active:scale-95 transition-all duration-200"
                                                >
                                                    Batal
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </form>
                )}
            </div>


        </div>
    );
}
