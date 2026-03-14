import { useMemo, useState, useEffect, useCallback } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { useMqtt } from "../context/MqttContext";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// Custom plugin for Grafana-style vertical crosshair line
const crosshairPlugin = {
  id: "crosshair",
  afterDraw: (chart) => {
    if (chart.tooltip?._active?.length) {
      const activePoint = chart.tooltip._active[0];
      const { ctx } = chart;
      const { x } = activePoint.element;
      const topY = chart.scales.y.top;
      const bottomY = chart.scales.y.bottom;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, bottomY);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.restore();
    }
  },
};

const DASHBOARD_CARDS = [
  // 1. Koneksi MQTT
  {
    id: "mqtt-status",
    label: "Status MQTT",
    getValue: (data, connected) =>
      connected ? "Connected" : "Disconnected",
    color: (connected) => (connected ? "green" : "red"),
  },
  // 2. Waktu server
  {
    id: "server-time",
    label: "Waktu Server",
    getValue: (_, __, time) => time,
    color: () => "blue",
  },
  // 3. Suhu ruangan
  {
    id: "latest-temp",
    label: "Suhu Ruangan",
    getValue: (data) =>
      data.dht22.temp.length > 0
        ? `${data.dht22.temp[data.dht22.temp.length - 1].toFixed(1)} °C`
        : "-- °C",
    getStats: (data) => {
      const values = data.dht22.temp;
      if (!values || values.length === 0) return null;
      const nums = values.map(Number).filter((n) => !isNaN(n));
      if (nums.length === 0) return null;
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      return {
        min: `${min.toFixed(1)}°`,
        avg: `${avg.toFixed(1)}°`,
        max: `${max.toFixed(1)}°`,
      };
    },
    color: () => "orange",
  },
  // 4. Daya aktif
  {
    id: "latest-power",
    label: "Daya Aktif",
    getValue: (data) =>
      data.pzem004t.power.length > 0
        ? `${data.pzem004t.power[data.pzem004t.power.length - 1].toFixed(1)} W`
        : "-- W",
    getStats: (data) => {
      const values = data.pzem004t.power;
      if (!values || values.length === 0) return null;
      const nums = values.map(Number).filter((n) => !isNaN(n));
      if (nums.length === 0) return null;
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      return {
        min: `${min.toFixed(1)}W`,
        avg: `${avg.toFixed(1)}W`,
        max: `${max.toFixed(1)}W`,
      };
    },
    color: () => "yellow",
  },
];

export default function Dashboard() {
  const { isConnected, connectionTime, sensorData, isReconnecting, reconnectAttempts } = useMqtt();
  const [serverTime, setServerTime] = useState(
    (() => {
      const d = new Date();
      return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
    })()
  );
  const [uptime, setUptime] = useState("--");

  const calculateUptime = useCallback((startTime) => {
    if (!startTime) return "--";

    const now = Date.now();
    const diff = now - startTime;

    const totalSeconds = Math.floor(diff / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const pad2 = (n) => String(n).padStart(2, "0");

    return `${days}:${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setServerTime((() => {
        const d = new Date();
        return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
      })());
      setUptime(calculateUptime(connectionTime));
    }, 1000);

    return () => clearInterval(interval);
  }, [connectionTime, calculateUptime]);

  const mqttStatusText = useMemo(() => {
    if (isConnected) return "Connected";
    if (isReconnecting || reconnectAttempts > 0) return "Reconnecting...";
    if (!isConnected && !connectionTime) return "Connecting...";
    return "Disconnected";
  }, [isConnected, isReconnecting, reconnectAttempts, connectionTime]);

  const mqttStatusColorKey = useMemo(() => {
    if (isConnected) return "green";
    if (isReconnecting || reconnectAttempts > 0) return "yellow";
    return "red";
  }, [isConnected, isReconnecting, reconnectAttempts]);

  const chartTemp = useMemo(() => {
    const dht = sensorData.dht22 || { temp: [], time: [] };
    const labels = (dht.time || []).slice(-60);
    return {
      labels,
      datasets: [{
        label: "Suhu (°C)",
        data: (dht.temp || []).slice(-60).map(Number).filter(n => !isNaN(n)),
        borderColor: "#f2495c",
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 200);
          gradient.addColorStop(0, 'rgba(242, 73, 92, 0.3)');
          gradient.addColorStop(1, 'rgba(242, 73, 92, 0)');
          return gradient;
        },
        tension: 0.4,
        pointRadius: 0,
        fill: true,
        borderWidth: 2,
      }]
    };
  }, [sensorData]);

  const chartHum = useMemo(() => {
    const dht = sensorData.dht22 || { hum: [], time: [] };
    const labels = (dht.time || []).slice(-60);
    return {
      labels,
      datasets: [{
        label: "Kelembaban (%)",
        data: (dht.hum || []).slice(-60).map(Number).filter(n => !isNaN(n)),
        borderColor: "#5794f2",
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 200);
          gradient.addColorStop(0, 'rgba(87, 148, 242, 0.3)');
          gradient.addColorStop(1, 'rgba(87, 148, 242, 0)');
          return gradient;
        },
        tension: 0.4,
        pointRadius: 0,
        fill: true,
        borderWidth: 2,
      }]
    };
  }, [sensorData]);

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 1000,
      easing: 'easeOutQuart'
    },
    plugins: {
      legend: { display: false },
      decimation: {
        enabled: false,
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(17, 18, 23, 0.9)',
        titleColor: '#d8d9da',
        bodyColor: '#d8d9da',
        borderColor: '#3c3d40',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 4,
        displayColors: true,
      },
    },
    hover: {
      mode: 'index',
      intersect: false,
    },
    scales: {
      y: {
        beginAtZero: false,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)',
          drawBorder: false,
        },
        ticks: {
          color: '#64748b',
          font: { size: 10 },
        }
      },
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#64748b',
          font: { size: 10 },
          maxTicksLimit: 6,
          autoSkip: true,
        }
      }
    }
  };

  // Add loading state for the chart
  const [isChartReady, setIsChartReady] = useState(false);

  useEffect(() => {
    // Small delay to ensure chart container is properly rendered
    const timer = setTimeout(() => {
      setIsChartReady(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const getColorClass = (color) => {
    const colors = {
      green: "bg-green-500 text-green-600",
      red: "bg-red-500 text-red-600",
      orange: "bg-orange-500 text-orange-600",
      yellow: "bg-yellow-500 text-yellow-600",
      slate: "bg-slate-500 text-slate-600",
    };
    return colors[color] || colors.slate;
  };

  return (
    <div className="page-section transition-opacity duration-300">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-800">NusaHome Dashboard</h2>
          <p className="text-slate-600 mt-1">
            Monitoring sistem sensor dan kontrol perangkat real-time
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
        {DASHBOARD_CARDS.map((card) => {
          const colorKey =
            card.id === "mqtt-status"
              ? mqttStatusColorKey
              : card.color(isConnected, sensorData);
          const colorClasses = getColorClass(colorKey);
          const [bgColor, textColor] = colorClasses.split(" ");
          const stats = card.getStats ? card.getStats(sensorData) : null;

          return (
            <div
              key={card.id}
              className="bg-white p-6 rounded-xl shadow-sm border border-slate-100/50 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-slate-500">
                  {card.label}
                </p>
                <div className={`w-2 h-2 rounded-full ${bgColor}`}></div>
              </div>
              <h3 className={`text-2xl font-bold ${textColor}`}>
                {card.id === "mqtt-status"
                  ? mqttStatusText
                  : card.getValue(sensorData, isConnected, serverTime, uptime)}
              </h3>
              {card.id === "mqtt-status" && (
                <p className="mt-1 text-xs text-slate-500">
                  Up time MQTT
                  {" "}
                  <span
                    className={`font-semibold ${isConnected ? "text-green-600" : "text-red-600"
                      }`}
                  >
                    {uptime}
                  </span>
                </p>
              )}
              {card.id === "server-time" && (
                <p className="mt-1 text-xs text-slate-500">
                  Tanggal
                  {" "}
                  <span className="font-semibold">
                    {new Date().toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </p>
              )}
              {stats && (
                <p className="mt-1 text-xs text-slate-500">
                  Min: <span className="font-semibold">{stats.min}</span>
                  {"  "}| Avg: <span className="font-semibold">{stats.avg}</span>
                  {"  "}| Max: <span className="font-semibold">{stats.max}</span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Temperature Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100/50 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800">Suhu Ruangan (DHT22)</h3>
            <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded">Realtime</span>
          </div>
          <div style={{ height: 260 }}>
            {!isChartReady || sensorData.dht22.time.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-500"></div>
              </div>
            ) : (
              <Line data={chartTemp} options={baseOptions} plugins={[crosshairPlugin]} />
            )}
          </div>
        </div>

        {/* Humidity Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100/50 transition-all duration-300 transform hover:-translate-y-0.5 hover:shadow-lg overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-800">Kelembaban (DHT22)</h3>
            <span className="text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded">Realtime</span>
          </div>
          <div style={{ height: 260 }}>
            {!isChartReady || sensorData.dht22.time.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              </div>
            ) : (
              <Line data={chartHum} options={baseOptions} plugins={[crosshairPlugin]} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
