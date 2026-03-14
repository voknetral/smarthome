import { useMqtt } from "../context/MqttContext";

/**
 * DeviceStatusIndicator - Shows Pico device status
 * 
 * Status Colors:
 * - 🔴 Red: OFFLINE
 * - 🟡 Yellow: BOOTING, WIFI_CONNECTED, SENSORS_INIT, MQTT_CONNECTED
 * - 🟢 Green: READY, ALIVE
 * - 🔵 Blue: ERROR
 */
export default function DeviceStatusIndicator({ compact = false }) {
    const { deviceStatus } = useMqtt();

    const getStatusConfig = (status) => {
        // Simple mapping: Anything that is not OFFLINE or ERROR is Online
        if (status === "ONLINE") {
            return {
                color: "bg-green-500",
                glow: "shadow-[0_0_8px_rgba(34,197,94,0.6)]",
                label: "Online",
                pulse: false
            };
        } else {
            return {
                color: "bg-red-500",
                glow: "shadow-[0_0_8px_rgba(239,68,68,0.6)]",
                label: "Offline",
                pulse: false
            };
        }
    };

    const config = getStatusConfig(deviceStatus?.status);

    const formatUptime = (seconds) => {
        if (!seconds) return "—";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}j ${m}m`;
        if (m > 0) return `${m}m ${s}d`;
        return `${s}d`;
    };

    const formatLastSeen = (timestamp) => {
        if (!timestamp) return "—";
        const diff = Math.floor((Date.now() - timestamp) / 1000);
        if (diff < 10) return "Baru saja";
        if (diff < 60) return `${diff}d lalu`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
        return `${Math.floor(diff / 3600)}j lalu`;
    };

    // Compact mode (for header)
    if (compact) {
        const chipColors = {
            Online: "bg-green-500/15 border-green-500/30 text-green-600",
            Offline: "bg-red-500/15 border-red-500/30 text-red-500",
            Error: "bg-blue-500/15 border-blue-500/30 text-blue-500",
            Degraded: "bg-orange-400/15 border-orange-400/30 text-orange-600",
            default: "bg-yellow-500/15 border-yellow-500/30 text-yellow-600"
        };
        const chipClass = chipColors[config.label] || chipColors.default;

        return (
            <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-sm cursor-default transition-all hover:scale-105 ${chipClass}`}
                title={`Pico: ${config.label}${deviceStatus?.uptime ? ` • Uptime: ${formatUptime(deviceStatus.uptime)}` : ''}`}
            >
                <div className={`relative w-2 h-2 rounded-full ${config.color} ${config.glow}`}>
                    {config.pulse && (
                        <div className={`absolute inset-0 rounded-full ${config.color} animate-ping opacity-75`} />
                    )}
                </div>
                <span className="text-xs font-semibold">
                    {config.label}
                </span>
            </div>
        );
    }

    // Full mode (for sidebar) - styled to match ProfileSection but without icon
    return (
        <div className="w-full flex items-center gap-3 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors">
            {/* Device Info - styled like user info, added left padding to align with user avatar center if needed, or just keep it clean */}
            <div className="text-left flex-1 min-w-0 pl-1">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">Pico</p>
                    {/* Status indicator dot */}
                    <div className={`relative w-2 h-2 rounded-full ${config.color} ${config.glow}`}>
                        {config.pulse && (
                            <div className={`absolute inset-0 rounded-full ${config.color} animate-ping opacity-75`} />
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${config.label === "Online" ? "text-green-400" :
                        config.label === "Offline" ? "text-red-400" :
                            config.label === "Error" ? "text-blue-400" :
                                "text-yellow-400"
                        }`}>
                        {config.label}
                    </span>
                    {deviceStatus?.status && deviceStatus.status !== "OFFLINE" && (
                        <span className="text-[10px] text-slate-500">
                            • Uptime: {formatUptime(deviceStatus.uptime)}
                        </span>
                    )}
                </div>
            </div>

            {/* Status Badge / Last Seen */}

        </div>
    );
}
