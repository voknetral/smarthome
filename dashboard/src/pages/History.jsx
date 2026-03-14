import { useState } from 'react'
import { useMqtt } from '../context/MqttContext'

export default function History() {
  const { history, clearHistory } = useMqtt()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const exportExcelLog = () => {
    if (history.length === 0) return

    import("xlsx").then((XLSX) => {
      const wb = XLSX.utils.book_new();

      const data = history.map(item => ({
        "Waktu": item.time,
        "Peristiwa": item.event,
        "Status": item.status
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wscols = [{ wch: 25 }, { wch: 40 }, { wch: 15 }];
      ws['!cols'] = wscols;

      XLSX.utils.book_append_sheet(wb, ws, "Riwayat Aktivitas");
      const filename = `activity_log_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, filename);
      setMobileMenuOpen(false);
    }).catch(err => {
      console.error("Gagal load xlsx:", err);
    });
  }

  const handleDeleteClick = () => {
    setShowDeleteModal(true)
    setMobileMenuOpen(false)
  }

  const confirmDelete = () => {
    clearHistory()
    setShowDeleteModal(false)
  }

  return (
    <div className="page-section">
      <div className="flex flex-row items-center justify-between mb-6 gap-2">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl md:text-2xl font-bold text-slate-800 truncate">Riwayat Aktivitas</h2>
          <p className="text-xs md:text-sm text-slate-600 truncate">Pantau sistem Nusa Home</p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {/* Desktop Buttons */}
          <div className="hidden md:flex gap-3">
            <button
              onClick={exportExcelLog}
              disabled={history.length === 0}
              className="w-32 px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
            <button
              onClick={handleDeleteClick}
              disabled={history.length === 0}
              className="w-32 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Hapus
            </button>
          </div>

          {/* Mobile Dropdown */}
          <div className="md:hidden relative">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
              title="Menu Aksi"
            >
              <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>

            {mobileMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMobileMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100/50 py-2 z-20">
                  <button
                    onClick={exportExcelLog}
                    disabled={history.length === 0}
                    className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-3 disabled:opacity-50"
                  >
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Export Log
                  </button>
                  <button
                    onClick={handleDeleteClick}
                    disabled={history.length === 0}
                    className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-3 disabled:opacity-50"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Hapus Log
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>


      <div className="space-y-4">
        {/* Desktop Table View */}
        <div className="hidden md:block bg-white rounded-xl shadow-sm border border-slate-100/50 overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Waktu
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Peristiwa
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {history.length === 0 ? (
                <tr>
                  <td colSpan="3" className="px-6 py-8 text-center text-slate-500">
                    <svg className="w-12 h-12 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Belum ada riwayat aktivitas
                  </td>
                </tr>
              ) : (
                history.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-3 text-slate-700 whitespace-nowrap text-sm">{item.time}</td>
                    <td className="px-6 py-3 text-slate-700 text-sm">{item.event}</td>
                    <td className={`px-6 py-3 font-semibold text-sm ${item.statusClass || 'text-slate-600'}`}>
                      {item.status}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3">
          {history.length === 0 ? (
            <div className="bg-white p-8 rounded-xl border border-slate-100/50 text-center text-slate-500 shadow-sm">
              <svg className="w-12 h-12 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Belum ada riwayat aktivitas
            </div>
          ) : (
            history.map((item, idx) => (
              <div key={idx} className="bg-white p-4 rounded-xl border border-slate-100/50 shadow-sm space-y-2 border-l-4" style={{ borderColor: item.statusClass?.includes('text-green') ? '#10b981' : item.statusClass?.includes('text-red') ? '#ef4444' : item.statusClass?.includes('text-yellow') ? '#f59e0b' : '#94a3b8' }}>
                <div className="flex justify-between items-start gap-2">
                  <h3 className="font-bold text-slate-800 text-xs leading-tight line-clamp-2">{item.event}</h3>
                  <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${item.status.toLowerCase().includes('connect') ? 'bg-green-500' :
                    item.status.toLowerCase().includes('reconn') ? 'bg-yellow-500' :
                      item.status.toLowerCase().includes('off') || item.status.toLowerCase().includes('close') ? 'bg-red-500' :
                        'bg-slate-400'
                    }`} />
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${item.statusClass || 'bg-slate-100 text-slate-600'
                    } bg-opacity-10`}>
                    Status: {item.status}
                  </span>
                </div>
                <div className="pt-1 flex items-center gap-1.5 text-slate-400">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[10px] font-medium leading-none">
                    {item.time}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 border border-slate-100 transform transition-all scale-100">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 bg-gradient-to-br from-red-50 to-red-100 rounded-2xl flex items-center justify-center text-red-600 mb-2 shadow-lg shadow-red-500/20">
                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              <div>
                <h3 className="text-2xl font-bold text-slate-800">Hapus Semua Log?</h3>
                <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                  Tindakan ini tidak dapat dibatalkan. Semua log aktivitas akan dihapus permanen dari sistem.
                </p>
              </div>

              <div className="flex flex-col w-full gap-3 pt-6">
                <button
                  onClick={confirmDelete}
                  className="w-full py-3.5 bg-gradient-to-r from-red-600 to-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:scale-[1.02] active:scale-95 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Ya, Hapus Semua
                </button>
                <button
                  onClick={() => setShowDeleteModal(false)}
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
  )
}
