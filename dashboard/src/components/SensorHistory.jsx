import { useState, useEffect, useMemo } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import zoomPlugin from 'chartjs-plugin-zoom';
import { API_BASE_URL } from '../config';
import HistoryStats from './HistoryStats';

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

// Register ChartJS components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    zoomPlugin
);

const SENSORS = [
    { id: 'dht22', name: 'Suhu & Kelembaban (DHT22)' },
    { id: 'mq2', name: 'Gas & Asap (MQ2)' },
    { id: 'pzem004t', name: 'Listrik (PZEM-004T)' },
    { id: 'bh1750', name: 'Cahaya (BH1750)' },
];

const RANGES = [
    { id: '1h', name: '1 Jam Terakhir' },
    { id: '6h', name: '6 Jam Terakhir' },
    { id: '12h', name: '12 Jam Terakhir' },
    { id: '24h', name: '24 Jam Terakhir' },
    { id: '7d', name: '7 Hari Terakhir' },
];

export default function SensorHistory() {
    const [selectedSensor, setSelectedSensor] = useState('dht22');
    const [selectedRange, setSelectedRange] = useState('24h');
    const [historyData, setHistoryData] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchData();
    }, [selectedSensor, selectedRange]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch History Data
            const historyRes = await fetch(`${API_BASE_URL}/history/${selectedSensor}?range=${selectedRange}`);
            if (!historyRes.ok) throw new Error('Gagal mengambil data history');
            const historyJson = await historyRes.json();
            setHistoryData(historyJson.data || []);

            // Fetch Stats
            const statsRes = await fetch(`${API_BASE_URL}/stats/${selectedSensor}?range=${selectedRange}`);
            if (statsRes.ok) {
                const statsJson = await statsRes.json();
                setStats(statsJson.stats);
            }
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = () => {
        window.location.href = `${API_BASE_URL}/export/${selectedSensor}`;
    };

    // Prepare Chart Data
    const chartData = useMemo(() => {
        if (!historyData.length) return null;

        const labels = historyData.map(d => {
            // Adjust timestamp format based on bucket or raw timestamp
            const ts = d.time_bucket || d.timestamp;
            const d = new Date(ts);
            const timeStr = [d.getHours(), d.getMinutes()].map(n => String(n).padStart(2, '0')).join(':');
            const dateStr = [String(d.getDate()).padStart(2, '0'), d.toLocaleString('id-ID', { month: 'short' })].join(' ');
            return `${dateStr}, ${timeStr}`;
        });

        let datasets = [];

        switch (selectedSensor) {
            case 'dht22':
                datasets = [
                    {
                        label: 'Suhu (°C)',
                        data: historyData.map(d => d.temperature),
                        borderColor: '#f2495c',
                        backgroundColor: 'rgba(242, 73, 92, 0.15)',
                        yAxisID: 'y',
                        fill: true,
                        tension: 0.4,
                    },
                    {
                        label: 'Kelembaban (%)',
                        data: historyData.map(d => d.humidity),
                        borderColor: '#5794f2',
                        backgroundColor: 'rgba(87, 148, 242, 0.15)',
                        yAxisID: 'y1',
                        fill: true,
                        tension: 0.4,
                    }
                ];
                break;
            case 'mq2':
                datasets = [
                    {
                        label: 'Asap (Smoke)',
                        data: historyData.map(d => d.smoke),
                        borderColor: '#73bf69',
                        backgroundColor: 'rgba(115, 191, 105, 0.15)',
                        fill: true,
                        tension: 0.4,
                    },
                    {
                        label: 'LPG',
                        data: historyData.map(d => d.gas_lpg),
                        borderColor: '#b877d9',
                        backgroundColor: 'rgba(0,0,0,0)',
                        tension: 0.4,
                    },
                    {
                        label: 'CO',
                        data: historyData.map(d => d.gas_co),
                        borderColor: '#f2495c',
                        backgroundColor: 'rgba(0,0,0,0)',
                        tension: 0.4,
                    }
                ];
                break;
            case 'pzem004t':
                datasets = [
                    {
                        label: 'Daya (Watt)',
                        data: historyData.map(d => d.power),
                        borderColor: '#ff9830',
                        backgroundColor: 'rgba(255, 152, 48, 0.15)',
                        yAxisID: 'y',
                        fill: true,
                        tension: 0.4,
                    },
                    {
                        label: 'Tegangan (Volt)',
                        data: historyData.map(d => d.voltage),
                        borderColor: '#3274d9',
                        yAxisID: 'y1',
                        borderDash: [5, 5],
                        tension: 0.4,
                    }
                ];
                break;
            case 'bh1750':
                datasets = [
                    {
                        label: 'Intensitas Cahaya (Lux)',
                        data: historyData.map(d => d.lux),
                        borderColor: '#fada5e',
                        backgroundColor: 'rgba(250, 218, 94, 0.15)',
                        fill: true,
                        tension: 0.4,
                    }
                ];
                break;
            default:
                break;
        }

        return { labels, datasets };
    }, [historyData, selectedSensor]);

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // Disable animations for better performance
        interaction: {
            mode: 'index',
            intersect: false,
        },
        elements: {
            point: {
                radius: 0, // Hide points for better performance
                hoverRadius: 4, // Show on hover
            },
            line: {
                tension: 0.3, // Smooth lines
                borderWidth: 2,
            }
        },
        plugins: {
            legend: {
                display: true,
                position: 'top',
                align: 'end',
                labels: {
                    color: '#94a3b8',
                    usePointStyle: true,
                    boxWidth: 6,
                    font: { size: 10 }
                }
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: '#111217',
                titleColor: '#d8d9da',
                bodyColor: '#d8d9da',
                borderColor: '#3c3d40',
                borderWidth: 1,
                padding: 10,
                cornerRadius: 4,
            },
            decimation: {
                enabled: true,
                algorithm: 'lttb',
                samples: 150,
            },
            zoom: {
                zoom: {
                    wheel: { enabled: true },
                    pinch: { enabled: true },
                    mode: 'x',
                },
                pan: {
                    enabled: true,
                    mode: 'x',
                }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: '#94a3b8', font: { size: 10 }, maxTicksLimit: 8 },
            },
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                grid: { color: 'rgba(0, 0, 0, 0.03)' },
                ticks: { color: '#94a3b8', font: { size: 10 } },
                title: { display: false }
            },
            y1: {
                type: 'linear',
                display: selectedSensor === 'dht22' || selectedSensor === 'pzem004t',
                position: 'right',
                grid: { drawOnChartArea: false },
                ticks: { color: '#94a3b8', font: { size: 10 } },
                title: { display: false }
            },
        },
    };

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100/50">
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <select
                        value={selectedSensor}
                        onChange={(e) => setSelectedSensor(e.target.value)}
                        className="px-4 py-2 bg-slate-50 border border-slate-100/50 rounded-lg text-sm font-medium focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    >
                        {SENSORS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>

                    <select
                        value={selectedRange}
                        onChange={(e) => setSelectedRange(e.target.value)}
                        className="px-4 py-2 bg-slate-50 border border-slate-100/50 rounded-lg text-sm font-medium focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    >
                        {RANGES.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                </div>

                <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors text-sm font-semibold w-full md:w-auto justify-center"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export Excel Data
                </button>
            </div>

            {loading && (
                <div className="flex justify-center p-12">
                    <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}

            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-lg border border-red-200 text-center">
                    {error}
                </div>
            )}

            {!loading && !error && historyData.length === 0 && (
                <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-100/50">
                    Tidak ada data untuk rentang waktu ini.
                </div>
            )}

            {!loading && !error && historyData.length > 0 && (
                <>
                    {/* Stats Cards */}
                    {stats && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {selectedSensor === 'dht22' && (
                                <>
                                    <HistoryStats label="temperature" unit="°C" stats={stats} color="red" />
                                    <HistoryStats label="humidity" unit="%" stats={stats} color="blue" />
                                </>
                            )}
                            {selectedSensor === 'mq2' && (
                                <>
                                    <HistoryStats label="smoke" unit=" ppm" stats={stats} color="slate" />
                                    <HistoryStats label="gas_lpg" unit=" ppm" stats={stats} color="orange" />
                                    <HistoryStats label="gas_co" unit=" ppm" stats={stats} color="yellow" />
                                </>
                            )}
                            {selectedSensor === 'pzem004t' && (
                                <>
                                    <HistoryStats label="power" unit=" W" stats={stats} color="yellow" />
                                    <HistoryStats label="voltage" unit=" V" stats={stats} color="blue" />
                                    <HistoryStats label="current" unit=" A" stats={stats} color="green" />
                                </>
                            )}
                            {selectedSensor === 'bh1750' && (
                                <HistoryStats label="lux" unit=" lx" stats={stats} color="orange" />
                            )}
                        </div>
                    )}

                    {/* Chart */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100/50 h-[400px]">
                        {chartData && <Line options={chartOptions} data={chartData} plugins={[crosshairPlugin]} />}
                    </div>

                    <p className="text-xs text-center text-slate-400">
                        Tip: Gunakan scroll mouse untuk zoom, dan drag untuk geser grafik.
                    </p>
                </>
            )}
        </div>
    );
}
