import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../config";
import { useMqtt } from "../context/MqttContext";

export default function BrokerSettings() {
    const { fetchWithAuth } = useAuth();
    const { connect, updateSettings } = useMqtt();
    const [brokerData, setBrokerData] = useState({
        host: "",
        port: "",
        ws_port: "",
        useSSL: true,
        updateInterval: "",
    });
    const [loading, setLoading] = useState(true);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    const [validationError, setValidationError] = useState("");
    const [showBrokerModal, setShowBrokerModal] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const response = await fetchWithAuth(`${API_BASE_URL}/settings`);
            if (!response.ok) throw new Error("Gagal memuat pengaturan");
            const data = await response.json();
            if (data.success && data.settings.mqtt_config) {
                const mqtt = data.settings.mqtt_config;
                setBrokerData({
                    host: mqtt.host,
                    port: mqtt.port,
                    ws_port: mqtt.ws_port || mqtt.port,
                    useSSL: mqtt.useSSL !== undefined ? mqtt.useSSL : true,
                    updateInterval: mqtt.updateInterval,
                });
            } else {
                setError("Gagal memuat konfigurasi MQTT");
            }
        } catch (err) {
            console.error(err);
            setError("Gagal terhubung ke server");
        } finally {
            setLoading(false);
        }
    };

    const handleBrokerChange = (e) => {
        const { name, value, type, checked } = e.target;
        setBrokerData((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : (
                name === "port" || name === "ws_port" || name === "updateInterval"
                    ? value === "" ? "" : parseInt(value) || ""
                    : value
            ),
        }));
    };

    const handleBrokerSubmit = (e) => {
        e.preventDefault();
        setValidationError("");

        if (!brokerData.host || brokerData.host.trim() === "") {
            setValidationError("MQTT Host harus diisi");
            return;
        }
        if (brokerData.port === "" || brokerData.port === null) {
            setValidationError("MQTT TCP Port harus diisi");
            return;
        }
        if (brokerData.ws_port === "" || brokerData.ws_port === null) {
            setValidationError("MQTT WebSocket Port harus diisi");
            return;
        }
        if (brokerData.updateInterval === "" || brokerData.updateInterval === null) {
            setValidationError("Update Interval harus diisi");
            return;
        }
        if (Number(brokerData.updateInterval) < 2) {
            setValidationError("Update Interval minimal 2 detik untuk menjaga kesehatan sensor");
            return;
        }

        setShowBrokerModal(true);
    };

    const confirmBrokerSave = async () => {
        try {
            setIsSaving(true);
            // Fetch current settings first to preserve other configs
            const currentSettingsRes = await fetchWithAuth(`${API_BASE_URL}/settings`);
            if (!currentSettingsRes.ok) throw new Error("Gagal memuat pengaturan saat ini");
            const currentSettingsData = await currentSettingsRes.json();
            const currentSettings = currentSettingsData.settings;

            const payload = {
                thresholds: currentSettings.thresholds, // Preserve thresholds
                enable_thresholds: currentSettings.enable_thresholds,
                telegram_config: currentSettings.telegram_config,
                mqtt_config: {
                    host: brokerData.host,
                    port: Number(brokerData.port),
                    ws_port: Number(brokerData.ws_port),
                    useSSL: brokerData.useSSL,
                    updateInterval: Number(brokerData.updateInterval)
                }
            };


            const res = await fetchWithAuth(`${API_BASE_URL}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Gagal menyimpan pengaturan");

            // Update local storage via MqttContext BEFORE reload
            updateSettings(payload.mqtt_config);

            setShowBrokerModal(false);
            setSaved(true);

            setTimeout(() => {
                setSaved(false);
                window.location.reload();
            }, 1000);

        } catch (err) {
            console.error(err);
            setValidationError("Gagal menyimpan ke server");
            setShowBrokerModal(false);
        } finally {
            setIsSaving(false);
        }
    };

    const handleBrokerReset = () => {
        setShowResetModal(true);
    };

    const confirmReset = async () => {
        try {
            setIsResetting(true);
            const response = await fetchWithAuth(`${API_BASE_URL}/settings/reset`, {
                method: 'POST'
            });
            if (!response.ok) throw new Error("Gagal reset pengaturan");
            const data = await response.json();
            if (data.success) {
                const mqtt = data.mqtt_config;
                setBrokerData({
                    host: mqtt.host,
                    port: mqtt.port,
                    ws_port: mqtt.ws_port,
                    useSSL: mqtt.useSSL,
                    updateInterval: mqtt.updateInterval,
                });

                // Update local storage via MqttContext BEFORE reload
                updateSettings(mqtt);

                setShowResetModal(false);
                setSaved(true);
                setTimeout(() => {
                    window.location.reload();
                }, 800);
            }
        } catch (err) {
            console.error(err);
            setValidationError("Gagal mereset pengaturan");
            setShowResetModal(false);
        } finally {
            setIsResetting(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-500">Memuat pengaturan...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

    return (
        <div className="page-section">
            <div className="mb-8 space-y-2">
                <h2 className="text-3xl font-bold text-slate-800">Pengaturan Broker</h2>
                <p className="text-slate-600 text-sm">Konfigurasi koneksi MQTT untuk sinkronisasi data sensor</p>
            </div>

            <div className="bg-white p-6 md:p-8 rounded-xl shadow-sm border border-slate-100/50">
                <form className="space-y-6" onSubmit={handleBrokerSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                MQTT Host
                                <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="host"
                                type="text"
                                value={brokerData.host}
                                onChange={handleBrokerChange}
                                placeholder="contoh: mqtt.pantau-rumah.my.id"
                                required
                                className="w-full px-4 py-3 border-2 border-teal-200 rounded-xl focus:ring-2 focus:ring-teal-500 transition-all outline-none bg-white font-medium text-sm"
                            />
                            <p className="mt-1 text-xs text-slate-500">Alamat host MQTT broker</p>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                TCP Port (Backend & Pico)
                                <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="port"
                                type="number"
                                value={brokerData.port}
                                onChange={handleBrokerChange}
                                placeholder="contoh: 1883"
                                min="1"
                                max="65535"
                                required
                                className="w-full px-4 py-3 border-2 border-teal-200 rounded-xl focus:ring-2 focus:ring-teal-500 transition-all outline-none bg-white font-medium text-sm"
                            />
                            <p className="mt-1 text-xs text-slate-500">Port standar MQTT TCP (default: 1883)</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                WebSocket Port (Dashboard)
                                <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="ws_port"
                                type="number"
                                value={brokerData.ws_port}
                                onChange={handleBrokerChange}
                                placeholder="contoh: 8884"
                                min="1"
                                max="65535"
                                required
                                className="w-full px-4 py-3 border-2 border-teal-200 rounded-xl focus:ring-2 focus:ring-teal-500 transition-all outline-none bg-white font-medium text-sm"
                            />
                            <p className="mt-1 text-xs text-slate-500">Port untuk koneksi Browser/Dashboard (default: 8884 untuk WSS)</p>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                Update Interval (detik)
                                <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="updateInterval"
                                type="number"
                                value={brokerData.updateInterval}
                                onChange={handleBrokerChange}
                                min="2"
                                max="3600"
                                required
                                className="w-full px-4 py-3 border-2 border-teal-200 rounded-xl focus:ring-2 focus:ring-teal-500 transition-all outline-none bg-white font-medium text-sm"
                            />
                            <p className="mt-1 text-xs text-slate-500">Interval update data dalam detik (2-3600). Direkomendasikan ≥ 2s untuk kesehatan sensor.</p>
                        </div>
                    </div>

                    <div className="pt-2">
                        <label className="flex items-center gap-3 cursor-pointer group w-fit">
                            <div className="relative">
                                <input
                                    name="useSSL"
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={brokerData.useSSL}
                                    onChange={handleBrokerChange}
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
                            </div>
                            <span className="text-sm font-semibold text-slate-700 group-hover:text-teal-600 transition-colors">Gunakan SSL/TLS (WSS)</span>
                        </label>
                        <p className="mt-1 text-xs text-slate-500">Gunakan koneksi terenkripsi untuk keamanan maksimal</p>
                    </div>

                    {validationError && (
                        <div className="p-4 bg-red-50 text-red-700 rounded-xl text-sm border border-red-200 flex items-start gap-3">
                            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            <span>{validationError}</span>
                        </div>
                    )}

                    {saved && (
                        <div className="p-4 bg-green-50 text-green-700 rounded-xl text-sm border border-green-200 flex items-start gap-3">
                            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                            <span>✓ Pengaturan broker berhasil disimpan! Menghubungkan ulang ke broker...</span>
                        </div>
                    )}


                    <div className="flex flex-col md:flex-row justify-end gap-3 pt-8 border-t border-slate-100/50">
                        <button
                            type="button"
                            onClick={handleBrokerReset}
                            className="order-2 md:order-1 group relative px-8 py-3.5 bg-white border-2 border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 hover:border-slate-300 hover:text-slate-700 active:scale-[0.97] transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Reset ke Default
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="order-1 md:order-2 group relative px-8 py-3.5 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white font-bold rounded-xl transition-all duration-300 shadow-xl shadow-teal-500/30 hover:shadow-teal-500/50 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
                        >
                            {isSaving ? (
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
                    </div>
                </form>
            </div>

            {/* Save Confirmation Modal */}
            {showBrokerModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all duration-300 animate-in fade-in">
                    <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl border border-slate-100 transform transition-all scale-100">
                        <div className="flex flex-col items-center text-center space-y-4">
                            <div className="w-16 h-16 bg-gradient-to-br from-teal-50 to-teal-100 rounded-2xl flex items-center justify-center text-teal-600 mb-2 shadow-lg shadow-teal-500/20">
                                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>

                            <div>
                                <h3 className="text-2xl font-bold text-slate-800">Simpan Konfigurasi?</h3>
                                <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                                    Perubahan ini akan <span className="font-bold text-teal-600">memuat ulang halaman</span> untuk menerapkan pengaturan koneksi broker yang baru.
                                </p>
                            </div>

                            <div className="flex flex-col w-full gap-3 pt-6">
                                <button
                                    onClick={confirmBrokerSave}
                                    disabled={isSaving}
                                    className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-teal-500/30 hover:shadow-teal-500/50 hover:scale-[1.02] active:scale-95 transition-all duration-200 flex items-center justify-center gap-2"
                                >
                                    {isSaving ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                    Ya, Simpan & Reload
                                </button>
                                <button
                                    onClick={() => setShowBrokerModal(false)}
                                    className="w-full py-3.5 bg-slate-100 text-slate-600 font-semibold rounded-xl hover:bg-slate-200 active:scale-95 transition-all duration-200"
                                >
                                    Batal
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset Confirmation Modal */}
            {showResetModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all duration-300 animate-in fade-in">
                    <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl border border-slate-100 transform transition-all scale-100">
                        <div className="flex flex-col items-center text-center space-y-4">
                            <div className="w-16 h-16 bg-gradient-to-br from-amber-50 to-orange-100 rounded-2xl flex items-center justify-center text-amber-500 mb-2 shadow-lg shadow-amber-500/20">
                                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>

                            <div>
                                <h3 className="text-2xl font-bold text-slate-800">Reset Pengaturan?</h3>
                                <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                                    Semua konfigurasi Host, Port, dan Interval akan dikembalikan ke setelan default.
                                </p>
                            </div>

                            <div className="flex flex-col w-full gap-3 pt-6">
                                <button
                                    onClick={confirmReset}
                                    disabled={isResetting}
                                    className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-xl shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 hover:scale-[1.02] active:scale-95 transition-all duration-200 flex items-center justify-center gap-2"
                                >
                                    {isResetting ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    )}
                                    Ya, Reset Sekarang
                                </button>
                                <button
                                    onClick={() => setShowResetModal(false)}
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
    );
}
