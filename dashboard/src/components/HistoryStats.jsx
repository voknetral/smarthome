import { useState } from 'react'

export default function HistoryStats({ stats, label, unit = '', color = 'slate', isRealtime = false }) {
    if (!stats) return null

    // Ensure stats numbers are valid, default to 0 if missing
    const min = stats[`${label}_min`] ?? 0
    const avg = stats[`${label}_avg`] ?? 0
    const max = stats[`${label}_max`] ?? 0

    const colorClasses = {
        slate: 'bg-slate-50 text-slate-700',
        red: 'bg-red-50 text-red-700',
        blue: 'bg-blue-50 text-blue-700',
        green: 'bg-green-50 text-green-700',
        yellow: 'bg-yellow-50 text-yellow-700',
        orange: 'bg-orange-50 text-orange-700',
        purple: 'bg-purple-50 text-purple-700',
        teal: 'bg-teal-50 text-teal-700',
        pink: 'bg-pink-50 text-pink-700',
        indigo: 'bg-indigo-50 text-indigo-700',
    }

    const activeColor = colorClasses[color] || colorClasses.slate

    return (
        <div className="relative">
            <div
                className={`rounded-lg px-3 py-2 text-xs font-medium shadow-sm ${activeColor} flex items-center gap-2 mt-2 transition-all hover:shadow-md`}
            >
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase opacity-70">Min</span>
                    <span className="font-bold">{Number(min).toFixed(2)}{unit}</span>
                </div>
                <div className="w-px h-6 bg-current opacity-20 mx-1"></div>
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase opacity-70">Avg</span>
                    <span className="font-bold">{Number(avg).toFixed(2)}{unit}</span>
                </div>
                <div className="w-px h-6 bg-current opacity-20 mx-1"></div>
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase opacity-70">Max</span>
                    <span className="font-bold">{Number(max).toFixed(2)}{unit}</span>
                </div>
            </div>
        </div>
    )
}
