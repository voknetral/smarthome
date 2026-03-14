import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import NotificationToast from "./NotificationToast";
import ForceChangePassword from "./ForceChangePassword";
import DeviceStatusIndicator from "./DeviceStatusIndicator";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // Close sidebar when clicking outside on mobile
  const handleMainClick = () => {
    if (sidebarOpen) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="bg-dominant min-h-screen flex font-sans relative" style={{ backgroundColor: 'var(--color-dominant-bg)' }}>
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden transition-opacity duration-200 ease-out"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed top-0 left-0 h-full z-30 transition-all ease-out duration-200 transform shadow-xl md:shadow-none ${sidebarOpen
          ? 'translate-x-0 opacity-100 md:opacity-100'
          : '-translate-x-full md:translate-x-0 opacity-0 md:opacity-100'
          } w-[280px] max-w-[85%] md:w-auto shadow-xl md:shadow-none`}
      >
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Desktop toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="hidden md:flex absolute top-1/2 -translate-y-1/2 right-0 translate-x-full bg-teal-500 hover:bg-teal-600 text-white px-1.5 py-3 rounded-r-md rounded-l-none shadow-lg border-2 border-white transition-all duration-200 ease-out z-30 items-center justify-center hover:shadow-[0_0_15px_rgba(20,184,166,0.5)]"
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg
            className={`w-5 h-5 transition-transform duration-200 ease-out ${sidebarCollapsed ? "" : "rotate-180"}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <main
        className={`min-h-screen overflow-y-auto transition-all duration-200 ease-out w-full pt-16 md:pt-0 ${sidebarCollapsed ? "md:ml-16" : "md:ml-64"}`}
        style={{
          background: 'var(--color-dominant-bg)',
          maxWidth: '100%',
          transition: 'margin-left 0.2s ease-out, width 0.2s ease-out'
        }}
        onClick={handleMainClick}
      >
        {/* Mobile Header */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-white border-b" style={{ borderColor: 'var(--color-secondary-border)' }}>
          <div className="flex items-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSidebarOpen(true);
              }}
              className="p-2 rounded-md hover:bg-slate-100 transition-colors"
              style={{ backgroundColor: 'var(--color-dominant-surface)' }}
              aria-label="Open menu"
            >
              <svg className="w-6 h-6" style={{ color: 'var(--color-secondary-dark)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold ml-3" style={{ color: 'var(--color-secondary-dark)' }}>NusaHome Dashboard</h1>
          </div>
          <DeviceStatusIndicator compact />
        </div>

        {/* Main Content Area */}
        <div className="p-4 md:p-6 lg:p-8 page-enter-active shadow-none relative" style={{
          backgroundColor: 'var(--color-secondary-surface)',
          minHeight: 'calc(100vh - 64px)',
          transition: 'all 0.2s ease-out',
          width: '100%',
          maxWidth: '100%',
          margin: '0 auto'
        }}>
          <Outlet />
        </div>
      </main>

      {/* Notification Toasts */}
      <NotificationToast />
      <ForceChangePassword />
    </div>
  );
}
