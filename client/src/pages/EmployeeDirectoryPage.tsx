import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { invalidateAllTimeQueries } from '../lib/sync';
import {
  UserPlus,
  Search,
  Trash2,
  Filter,
  Eye,
  EyeOff,
  Key,
  Copy,
  Check,
  AlertTriangle,
  Pencil,
} from 'lucide-react';

export const EmployeeDirectoryPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isCeo = user?.role === 'CEO_ADMIN';

  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  // Password visibility map
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Edit credentials modal state
  const [editingPasswordEmp, setEditingPasswordEmp] = useState<any | null>(null);
  const [newPasswordVal, setNewPasswordVal] = useState('');
  const [showNewPasswordVal, setShowNewPasswordVal] = useState(false);
  const [showCurrentPasswordVal, setShowCurrentPasswordVal] = useState(false);

  // Edit Compensation modal state
  const [selectedCompEmployee, setSelectedCompEmployee] = useState<any | null>(null);
  const [editBaseRate, setEditBaseRate] = useState<number>(45.0);
  const [editOtRate, setEditOtRate] = useState<number>(67.5);

  // New Employee Form States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('EMPLOYEE');
  const [employeeCode, setEmployeeCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [department, setDepartment] = useState('Engineering');
  const [position, setPosition] = useState('Software Engineer');
  const [hireDate, setHireDate] = useState(new Date().toISOString().slice(0, 10));
  const [baseRate, setBaseRate] = useState(45.0);
  const [otRate, setOtRate] = useState(67.5);

  // Edit Employee Details State
  const [editingEmployee, setEditingEmployee] = useState<any | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [editStatus, setEditStatus] = useState('ACTIVE');
  const [editEmail, setEditEmail] = useState('');
  const [editEmployeeCode, setEditEmployeeCode] = useState('');

  // 1. Fetch directory
  const { data: directoryResponse, isLoading, isError, error } = useQuery({
    queryKey: ['employeeDirectory', search, filterDept, filterStatus],
    queryFn: async () => {
      let url = `/employees?search=${encodeURIComponent(search)}`;
      if (filterDept) url += `&department=${encodeURIComponent(filterDept)}`;
      if (filterStatus) url += `&status=${encodeURIComponent(filterStatus)}`;
      const res = await api.get(url);
      return res.data;
    },
    placeholderData: (previousData) => previousData,
  });

  const employees: any[] = Array.isArray(directoryResponse?.data)
    ? directoryResponse.data
    : Array.isArray(directoryResponse)
      ? directoryResponse
      : [];

  // Create Employee Mutation
  const createEmployeeMutation = useMutation({
    mutationFn: (data: any) => api.post('/employees', data),
    onSuccess: () => {
      invalidateAllTimeQueries(queryClient);
      setShowAddModal(false);
      setPassword('');
      alert('Employee provisioned successfully!');
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Failed to provision employee');
    },
  });

  // Delete Employee Mutation
  const deleteEmployeeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/employees/${id}`),
    onSuccess: () => {
      invalidateAllTimeQueries(queryClient);
      alert('Employee removed from directory.');
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Failed to delete employee');
    },
  });

  // Update Employee Mutation
  const updateEmployeeMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.patch(`/employees/${id}`, data),
    onSuccess: () => {
      invalidateAllTimeQueries(queryClient);
      setEditingEmployee(null);
      alert('Employee details updated successfully!');
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Failed to update employee details');
    },
  });

  const openEditEmployeeModal = (emp: any) => {
    setEditingEmployee(emp);
    setEditFirstName(emp.firstName);
    setEditLastName(emp.lastName);
    setEditEmail(emp.user?.email || '');
    setEditEmployeeCode(emp.employeeCode || '');
    setEditDepartment(emp.department);
    setEditPosition(emp.position);
    setEditStatus(emp.status);
  };

  // Update Password Mutation (CEO Only)
  const updatePasswordMutation = useMutation({
    mutationFn: ({ id, password }: any) => api.patch(`/employees/${id}/password`, { password }),
    onSuccess: () => {
      invalidateAllTimeQueries(queryClient);
      setEditingPasswordEmp(null);
      setNewPasswordVal('');
      alert('Password updated successfully!');
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Failed to update password');
    },
  });

  // Update Compensation Mutation (CEO Only)
  const updateCompMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.put(`/employees/${id}/compensation`, data),
    onSuccess: () => {
      invalidateAllTimeQueries(queryClient);
      setSelectedCompEmployee(null);
      alert('Compensation package updated!');
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Failed to update compensation');
    },
  });

  const togglePasswordVisibility = (id: string) => {
    setRevealedPasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (id: string, text: string) => {
    try {
      navigator.clipboard?.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
    }
  };

  if (isLoading && !directoryResponse) {
    return <div className="p-8 text-slate-500 font-medium">Loading employee roster...</div>;
  }

  if (isError) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-3">
          <AlertTriangle className="shrink-0 text-rose-600 mt-0.5" size={20} />
          <div>
            <h3 className="font-bold text-sm">Failed to load Employee Directory</h3>
            <p className="text-xs text-rose-600 mt-1">
              {(error as any)?.response?.data?.message || (error as any)?.message || 'An unexpected error occurred.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Employee Directory & Credentials</h1>
          <p className="text-sm text-slate-500">
            Internal company staff, roles, departments, and CEO credential oversight.
          </p>
        </div>

        {isCeo && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-ccp-500 hover:bg-ccp-600 text-white font-bold text-xs rounded-xl shadow-md transition shrink-0"
          >
            <UserPlus size={16} />
            <span>Provision Employee</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar: Protected against browser autofill */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col md:flex-row gap-3">
        <div className="flex-1 flex items-center gap-2 px-2">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input
            type="search"
            name="employee-search-filter"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, employee code, or email..."
            className="w-full text-sm outline-none bg-transparent"
          />
        </div>

        <div className="flex items-center gap-2 border-t md:border-t-0 md:border-l md:pl-3 pt-2 md:pt-0">
          <Filter size={16} className="text-slate-400" />
          <select
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            className="text-xs border rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
          >
            <option value="">All Departments</option>
            <option value="Engineering">Engineering</option>
            <option value="Executive">Executive</option>
            <option value="Operations">Operations</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs border rounded-lg px-2.5 py-1.5 bg-white text-slate-700"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="TERMINATED">Terminated</option>
          </select>
        </div>
      </div>

      {/* Directory Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-bold border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">Employee</th>
              <th className="px-6 py-4">Code</th>
              <th className="px-6 py-4">Department & Position</th>
              {isCeo && <th className="px-6 py-4">Sign-In Password</th>}
              {isCeo && <th className="px-6 py-4">Hourly Rates</th>}
              {isCeo && <th className="px-6 py-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.length === 0 ? (
              <tr>
                <td colSpan={isCeo ? 6 : 3} className="text-center py-10 text-slate-400 text-sm">
                  No employees found matching the specified filters.
                </td>
              </tr>
            ) : (
              employees.map((emp: any) => {
                const isRevealed = revealedPasswords[emp.id] || false;
                const plainPass = emp.user?.managedPassword || '••••••••';

                return (
                  <tr key={emp.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className="text-xs text-slate-400">{emp.user?.email}</div>
                    </td>

                    <td className="px-6 py-4 font-mono text-xs font-bold text-slate-700">
                      {emp.employeeCode}
                    </td>

                    <td className="px-6 py-4">
                      <div className="text-slate-900 font-semibold">{emp.position}</div>
                      <div className="text-xs text-slate-400">{emp.department}</div>
                    </td>

                    {/* CEO Password Column */}
                    {isCeo && (
                      <td className="px-6 py-4 font-mono text-xs">
                        {emp.user?.managedPassword ? (
                          <div className="flex items-center gap-2 bg-slate-50 border px-2.5 py-1 rounded-lg w-fit">
                            <span className="font-bold text-slate-800">
                              {isRevealed ? plainPass : '••••••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() => togglePasswordVisibility(emp.id)}
                              className="text-slate-400 hover:text-slate-700 transition"
                              title={isRevealed ? 'Hide Password' : 'Show Password'}
                            >
                              {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                            {isRevealed && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(emp.id, plainPass)}
                                className="text-slate-400 hover:text-slate-700 transition"
                                title="Copy Password"
                              >
                                {copiedId === emp.id ? (
                                  <Check size={14} className="text-emerald-600" />
                                ) : (
                                  <Copy size={14} />
                                )}
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Encrypted</span>
                        )}
                      </td>
                    )}

                    {/* CEO Compensation Column */}
                    {isCeo && (
                      <td className="px-6 py-4 font-mono text-xs">
                        {emp.compensation ? (
                          <div>
                            <span className="font-bold text-slate-900">
                              ${parseFloat(emp.compensation.baseHourlyRate).toFixed(2)}/hr
                            </span>
                            <span className="text-slate-400 ml-1">
                              (OT: ${parseFloat(emp.compensation.overtimeHourlyRate).toFixed(2)})
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">Not configured</span>
                        )}
                      </td>
                    )}

                    {isCeo && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isCeo && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPasswordEmp(emp);
                                setNewPasswordVal('');
                              }}
                              className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                              title="Change / Correct Password"
                            >
                              <Key size={16} />
                            </button>
                          )}

                          {isCeo && (
                            <button
                              type="button"
                              onClick={() => openEditEmployeeModal(emp)}
                              className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                              title="Edit Employee Details"
                            >
                              <Pencil size={15} />
                            </button>
                          )}

                          {isCeo && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCompEmployee(emp);
                                if (emp.compensation) {
                                  setEditBaseRate(parseFloat(emp.compensation.baseHourlyRate) || 45);
                                  setEditOtRate(parseFloat(emp.compensation.overtimeHourlyRate) || 67.5);
                                }
                              }}
                              className="px-2.5 py-1 text-xs font-semibold text-ccp-700 hover:bg-ccp-50 border border-ccp-200 rounded-lg transition"
                            >
                              Rates
                            </button>
                          )}

                          {isCeo && (
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Are you sure you want to remove ${emp.firstName} ${emp.lastName}?`)) {
                                  deleteEmployeeMutation.mutate(emp.id);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Delete Employee"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* PROVISION EMPLOYEE MODAL (CEO ONLY) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Provision New Employee</h2>
            <form
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                createEmployeeMutation.mutate({
                  email: email.trim(),
                  password,
                  role,
                  employeeCode: employeeCode.trim().toUpperCase(),
                  firstName: firstName.trim(),
                  lastName: lastName.trim(),
                  department: department.trim(),
                  position: position.trim(),
                  hireDate,
                  compensation: {
                    baseHourlyRate: Number(baseRate),
                    overtimeHourlyRate: Number(otRate),
                    currency: 'USD',
                  },
                });
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="px-3 py-2 text-xs border rounded-lg"
                />
                <input
                  type="text"
                  required
                  placeholder="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="px-3 py-2 text-xs border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="email"
                  required
                  placeholder="Email Address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="px-3 py-2 text-xs border rounded-lg"
                />

                <div className="relative">
                  <input
                    type={showCreatePassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    placeholder="Initial Password (min 8 chars)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs border rounded-lg pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword(!showCreatePassword)}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                    title={showCreatePassword ? 'Hide' : 'Show'}
                  >
                    {showCreatePassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Employee Code (e.g. EMP-004)"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
                  className="px-3 py-2 text-xs border rounded-lg uppercase"
                />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="px-3 py-2 text-xs border rounded-lg bg-white"
                >
                  <option value="EMPLOYEE">Role: Employee</option>
                  <option value="PROJECT_MANAGER">Role: Project Manager</option>
                  <option value="CEO_ADMIN">Role: CEO / Admin</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="px-3 py-2 text-xs border rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Position"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="px-3 py-2 text-xs border rounded-lg"
                />
                <input
                  type="date"
                  required
                  value={hireDate}
                  onChange={(e) => setHireDate(e.target.value)}
                  className="px-2 py-2 text-xs border rounded-lg"
                />
              </div>

              <div className="border-t pt-2 grid grid-cols-2 gap-3 bg-ccp-50/50 p-2.5 rounded-lg border-ccp-100">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-ccp-700 mb-1">
                    Base Hourly Rate ($)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={baseRate}
                    onChange={(e) => setBaseRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 text-xs border rounded bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-ccp-700 mb-1">
                    Overtime Rate ($)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={otRate}
                    onChange={(e) => setOtRate(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 text-xs border rounded bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createEmployeeMutation.isPending}
                  className="px-5 py-2 bg-ccp-500 hover:bg-ccp-600 text-white text-xs font-bold rounded-lg transition"
                >
                  {createEmployeeMutation.isPending ? 'Provisioning...' : 'Provision Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHANGE / CORRECT PASSWORD MODAL (ISOLATED FORM TO PREVENT AUTOFILL) */}
      {editingPasswordEmp && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Correct Employee Password</h2>
            <p className="text-xs text-slate-500">
              Update sign-in password for {editingPasswordEmp.firstName} {editingPasswordEmp.lastName}
            </p>

            <form
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                updatePasswordMutation.mutate({
                  id: editingPasswordEmp.id,
                  password: newPasswordVal,
                });
              }}
              className="space-y-4"
            >
              {/* 1. CURRENT ACTIVE PASSWORD DISPLAY */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Current Active Password
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-slate-800">
                    {editingPasswordEmp.user?.managedPassword
                      ? (showCurrentPasswordVal ? editingPasswordEmp.user.managedPassword : '••••••••')
                      : 'Not recorded (Seeded account)'}
                  </span>
                  {editingPasswordEmp.user?.managedPassword && (
                    <button
                      type="button"
                      onClick={() => setShowCurrentPasswordVal(!showCurrentPasswordVal)}
                      className="text-slate-400 hover:text-slate-700 p-1"
                      title={showCurrentPasswordVal ? 'Hide' : 'Show'}
                    >
                      {showCurrentPasswordVal ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  )}
                </div>
              </div>

              {/* 2. NEW PASSWORD INPUT (To fix typos or update) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Set New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPasswordVal ? 'text' : 'password'}
                    name="correct-employee-password-field"
                    autoComplete="new-password"
                    required
                    value={newPasswordVal}
                    onChange={(e) => setNewPasswordVal(e.target.value)}
                    placeholder="Enter replacement password (min 8 chars)"
                    className="w-full px-3 py-2 text-sm border rounded-lg pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPasswordVal(!showNewPasswordVal)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPasswordVal ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPasswordEmp(null)}
                  className="px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={!newPasswordVal || newPasswordVal.length < 8 || updatePasswordMutation.isPending}
                  className="px-4 py-2 bg-ccp-700 hover:bg-ccp-800 text-white text-xs font-bold rounded-lg shadow disabled:opacity-50"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT COMPENSATION MODAL (CEO ONLY) */}
      {selectedCompEmployee && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Edit Compensation</h2>
            <p className="text-xs text-slate-500">
              Update hourly rates for {selectedCompEmployee.firstName} {selectedCompEmployee.lastName}
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Base Hourly Rate ($)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={editBaseRate}
                  onChange={(e) => setEditBaseRate(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Overtime Hourly Rate ($)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={editOtRate}
                  onChange={(e) => setEditOtRate(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm border rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedCompEmployee(null)}
                className="px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  updateCompMutation.mutate({
                    id: selectedCompEmployee.id,
                    data: {
                      baseHourlyRate: editBaseRate,
                      overtimeHourlyRate: editOtRate,
                      currency: 'USD',
                      effectiveDate: new Date().toISOString().slice(0, 10),
                    },
                  })
                }
                disabled={updateCompMutation.isPending}
                className="px-4 py-2 bg-ccp-700 hover:bg-ccp-800 text-white text-xs font-bold rounded-lg shadow"
              >
                Save Package
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT EMPLOYEE DETAILS MODAL */}
      {editingEmployee && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="text-base font-bold text-slate-900">Edit Employee Details</h2>
              <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded">
                {editingEmployee.employeeCode}
              </span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateEmployeeMutation.mutate({
                  id: editingEmployee.id,
                  data: {
                    firstName: editFirstName.trim(),
                    lastName: editLastName.trim(),
                    email: editEmail.trim(),
                    employeeCode: editEmployeeCode.trim().toUpperCase(),
                    department: editDepartment.trim(),
                    position: editPosition.trim(),
                    status: editStatus,
                  },
                });
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Employee Code</label>
                  <input
                    type="text"
                    required
                    value={editEmployeeCode}
                    onChange={(e) => setEditEmployeeCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-xs border rounded-lg font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                    className="w-full px-3 py-2 text-xs border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                    className="w-full px-3 py-2 text-xs border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
                  <input
                    type="text"
                    required
                    value={editDepartment}
                    onChange={(e) => setEditDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-xs border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Position</label>
                  <input
                    type="text"
                    required
                    value={editPosition}
                    onChange={(e) => setEditPosition(e.target.value)}
                    className="w-full px-3 py-2 text-xs border rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Employment Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg bg-white"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="TERMINATED">TERMINATED</option>
                  <option value="ON_LEAVE">ON_LEAVE</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateEmployeeMutation.isPending}
                  className="px-5 py-2 bg-ccp-700 hover:bg-ccp-800 text-white text-xs font-bold rounded-lg shadow disabled:opacity-50"
                >
                  {updateEmployeeMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};