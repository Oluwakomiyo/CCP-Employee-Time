import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { UserRole } from './context/AuthContext';
import { AppLayout } from './components/AppLayout';
import { CcpLogo } from './components/CcpLogo';
import { Eye, EyeOff } from 'lucide-react';

// Feature Pages
import { PunchClockPage } from './pages/PunchClockPage';
import { TimesheetsPage } from './pages/TimesheetsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { CorrectionsPage } from './pages/CorrectionsPage';
import { WorkEvidencePage } from './pages/WorkEvidencePage';
import { EmployeeDirectoryPage } from './pages/EmployeeDirectoryPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { PayrollPage } from './pages/PayrollPage';

const queryClient = new QueryClient();

const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}> = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ccp-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-bold text-ccp-700">403 - Access Denied</h2>
        <p className="text-slate-600 mt-2">You lack authorization for this resource.</p>
      </div>
    );
  }

  return <>{children}</>;
};

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      window.location.href = '/punch';
    } catch (err: any) {
      setError(err.response?.data?.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-ccp-950 via-ccp-900 to-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 border border-slate-100">
        <div className="flex flex-col items-center mb-8">
          <CcpLogo size={58} />
          <h1 className="text-xl font-bold text-slate-800 mt-4">Employee Portal</h1>
          <p className="text-xs text-slate-500">Time & Project Management System</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-ccp-500 text-ccp-700 text-xs font-medium rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Company Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-ccp-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-ccp-500 pr-10"
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-ccp-500 hover:bg-ccp-600 text-white font-semibold py-2.5 rounded-lg text-sm transition shadow-md hover:shadow-lg disabled:opacity-50"
          >
            {submitting ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 text-center text-[11px] text-slate-400">
          Internal authorized use only &bull; Audited access
        </div>
      </div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/punch" replace />} />
              <Route path="punch" element={<PunchClockPage />} />
              <Route path="timesheets" element={<TimesheetsPage />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="corrections" element={<CorrectionsPage />} />

              <Route
                path="team-activity"
                element={
                  <ProtectedRoute allowedRoles={['CEO_ADMIN', 'PROJECT_MANAGER']}>
                    <WorkEvidencePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="employees"
                element={
                  <ProtectedRoute allowedRoles={['CEO_ADMIN', 'PROJECT_MANAGER']}>
                    <EmployeeDirectoryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="audit-logs"
                element={
                  <ProtectedRoute allowedRoles={['CEO_ADMIN', 'PROJECT_MANAGER']}>
                    <AuditLogsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="payroll"
                element={
                  <ProtectedRoute allowedRoles={['CEO_ADMIN']}>
                    <PayrollPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;