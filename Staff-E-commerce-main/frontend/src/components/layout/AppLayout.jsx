// src/components/layout/AppLayout.jsx
import React, { useCallback, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import GlobalSpinner from "../ui/GlobalSpinner";

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // stable callbacks so child components don't get new props every render
  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((s) => !s);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  // memoize sidebar/topbar elements so they won't re-create DOM subtree
  // unless the dependencies change.
  const sidebarEl = useMemo(() => {
    return <Sidebar collapsed={!sidebarOpen} onClose={handleCloseSidebar} />;
  }, [sidebarOpen, handleCloseSidebar]);

  const topbarEl = useMemo(() => {
    return <Topbar onToggleSidebar={handleToggleSidebar} />;
  }, [handleToggleSidebar]);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar (fixed or hidden on small screens) */}
      {sidebarEl}

      {/* Page content */}
      <div className="flex-1 md:ml-64 flex flex-col min-h-0">
        {topbarEl}

        {/* main area: Outlet is where router will render the active route content */}
        <main className="p-4 overflow-auto">
          <Outlet />
        </main>
      </div>
      {/* <GlobalSpinner /> */}
    </div>
  );
}
