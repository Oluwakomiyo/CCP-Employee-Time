import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CcpLogo } from './CcpLogo';
import {
  Clock,
  Calendar,
  FolderKanban,
  Users,
  FileCheck2,
  Banknote,
  ShieldAlert,
  LogOut,
  Activity,
} from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();

  const isCeo = user?.role === 'CEO_ADMIN';
  const isPmOrCeo = user?.role === 'CEO_ADMIN' || user?.role === 'PROJECT_MANAGER';

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive
      ? 'bg-ccp-700 text-white shadow-sm'
      : 'text-slate-300 hover:bg-ccp-900 hover:text-white'
    }`;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">

      {/* Sidebar styled with CCP Deep Wine / Maroon */}
      <aside className="w-64 bg-ccp-950 text-white flex flex-col justify-between border-r border-ccp-900">
        <div>
          {/* Logo Header */}
          <div className="h-16 flex items-center px-6 bg-ccp-950/80 border-b border-ccp-900">
            <CcpLogo size={45} />
          </div>

          {/* User Badge */}
          <div className="p-4 mx-3 my-3 rounded-lg bg-ccp-900/60 border border-ccp-800/40">
            <div className="text-xs font-semibold uppercase tracking-wider text-ccp-300">
              {user?.role.replace('_', ' ')}
            </div>
            <div className="text-sm font-bold text-white truncate">
              {user?.employee?.firstName} {user?.employee?.lastName}
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5">
              {user?.employee?.employeeCode}
            </div>
          </div>

          {/* Nav Links */}
          <nav className="px-3 space-y-1 mt-2">
            {/* Personal Attendance */}
            <div className="pb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Personal
            </div>

            <NavLink to="/punch" className={navClass}>
              <Clock size={18} />
              <span>Punch Clock</span>
            </NavLink>

            <NavLink to="/timesheets" className={navClass}>
              <Calendar size={18} />
              <span>My Timesheets</span>
            </NavLink>

            {/* Regular Employees keep access to their own projects & correction requests */}
            {!isPmOrCeo && (
              <>
                <NavLink to="/projects" className={navClass}>
                  <FolderKanban size={18} />
                  <span>My Projects</span>
                </NavLink>

                <NavLink to="/corrections" className={navClass}>
                  <FileCheck2 size={18} />
                  <span>My Corrections</span>
                </NavLink>
              </>
            )}

            {/* 🔴 MANAGEMENT SECTION (CEO_ADMIN & PROJECT_MANAGER) */}
            {isPmOrCeo && (
              <>
                <div className="pt-4 pb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-ccp-400">
                  Management
                </div>

                <NavLink to="/projects" className={navClass}>
                  <FolderKanban size={18} />
                  <span>Projects & Teams</span>
                </NavLink>

                <NavLink to="/corrections" className={navClass}>
                  <FileCheck2 size={18} />
                  <span>Correction Requests</span>
                </NavLink>

                <NavLink to="/team-activity" className={navClass}>
                  <Activity size={18} />
                  <span>Work Evidence</span>
                </NavLink>

                <NavLink to="/employees" className={navClass}>
                  <Users size={18} />
                  <span>Employee Directory</span>
                </NavLink>

                <NavLink to="/audit-logs" className={navClass}>
                  <ShieldAlert size={18} />
                  <span>Audit Logs</span>
                </NavLink>
              </>
            )}

            {/* Financials (CEO Admin Only) */}
            {isCeo && (
              <>
                <div className="pt-4 pb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-ccp-400">
                  Financials
                </div>

                <NavLink to="/payroll" className={navClass}>
                  <Banknote size={18} />
                  <span>Payroll Engine</span>
                </NavLink>
              </>
            )}
          </nav>
        </div>

        {/* Footer Logout */}
        <div className="p-4 border-t border-ccp-900">
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-ccp-900 rounded-lg transition"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8">
          <div className="text-sm font-semibold text-slate-700">
            Internal Operations Portal
          </div>
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs text-slate-500 font-medium">System Online</span>
          </div>
        </header>

        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};