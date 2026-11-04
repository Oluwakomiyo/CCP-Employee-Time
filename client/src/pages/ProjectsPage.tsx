import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { invalidateAllTimeQueries } from '../lib/sync';
import {
  Plus,
  Users,
  Trash2,  
  Search,
  DollarSign,
  Archive,
  Pencil,
} from 'lucide-react';

export const ProjectsPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isCeo = user?.role === 'CEO_ADMIN';
  const isManager = user?.role === 'CEO_ADMIN' || user?.role === 'PROJECT_MANAGER';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [managingProject, setManagingProject] = useState<any | null>(null);
  const [analyticsProject, setAnalyticsProject] = useState<any | null>(null);

  // New project form
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');

  // Edit Project State
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  // Member assignment form
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [isLead, setIsLead] = useState(false);

  // 1. Fetch projects
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projectsList', search, statusFilter],
    queryFn: async () => {
      const activeParam =
        statusFilter === 'ACTIVE' ? '&isActive=true' : statusFilter === 'COMPLETED' ? '&isActive=false' : '';
      const res = await api.get(`/projects?search=${encodeURIComponent(search)}${activeParam}`);
      return res.data.data;
    },
    placeholderData: (previousData) => previousData,
  });

  // 2. Fetch project cost analytics (when modal is opened)
  const { data: costAnalytics } = useQuery({
    queryKey: ['projectCost', analyticsProject?.id],
    queryFn: async () => {
      if (!analyticsProject) return null;
      const res = await api.get(`/projects/${analyticsProject.id}/cost-breakdown`);
      return res.data.data;
    },
    enabled: !!analyticsProject,
  });

  // 3. Fetch employees dropdown
  const { data: employees } = useQuery({
    queryKey: ['employeesDropdown'],
    queryFn: async () => {
      const res = await api.get('/employees?limit=100');
      return res.data.data;
    },
    enabled: isManager,
  });

  // Create Project Mutation
  const createProjectMutation = useMutation({
    mutationFn: (data: any) => api.post('/projects', data),
    onSuccess: () => {
      invalidateAllTimeQueries(queryClient);
      setShowCreateModal(false);
      setCode('');
      setName('');
      setDescription('');
      setEndDate('');
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Failed to create project');
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.patch(`/projects/${id}`, data),
    onSuccess: () => {
      invalidateAllTimeQueries(queryClient);
      setEditingProject(null);
      alert('Project details updated successfully!');
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Failed to update project');
    },
  });

  const openEditModal = (proj: any) => {
    setEditingProject(proj);
    setEditName(proj.name);
    setEditDescription(proj.description || '');
    setEditStartDate(new Date(proj.startDate).toISOString().slice(0, 10));
    setEditEndDate(proj.endDate ? new Date(proj.endDate).toISOString().slice(0, 10) : '');
  };

  // Delete Project Mutation
  const deleteProjectMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${id}`),
    onSuccess: () => {
      invalidateAllTimeQueries(queryClient);
      alert('Project deleted successfully.');
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Failed to delete project');
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: any) => api.patch(`/projects/${id}`, { isActive }),
    onSuccess: () => invalidateAllTimeQueries(queryClient),
  });

  // In-modal member assignment
  const assignMemberMutation = useMutation({
    mutationFn: ({ projectId, data }: any) => api.post(`/projects/${projectId}/members`, data),
    onSuccess: (res) => {
      invalidateAllTimeQueries(queryClient);
      setManagingProject((prev: any) => ({
        ...prev,
        members: [...prev.members, res.data.data.membership],
      }));
      setSelectedEmployeeId('');
      setIsLead(false);
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || 'Failed to assign member');
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: ({ projectId, employeeId }: any) =>
      api.delete(`/projects/${projectId}/members/${employeeId}`),
    onSuccess: (_, variables) => {
      invalidateAllTimeQueries(queryClient);
      setManagingProject((prev: any) => ({
        ...prev,
        members: prev.members.filter((m: any) => m.employeeId !== variables.employeeId),
      }));
    },
  });

  const getTimeRemaining = (endDateStr: string | null) => {
    if (!endDateStr) return { text: 'Ongoing', isUrgent: false };
    const target = new Date(endDateStr).getTime();
    const now = new Date().getTime();
    const diffDays = Math.ceil((target - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, isUrgent: true };
    if (diffDays === 0) return { text: 'Due today', isUrgent: true };
    return { text: `${diffDays}d left`, isUrgent: diffDays <= 7 };
  };

  if (isLoading && !projects) return <div className="p-8 text-slate-500 font-medium">Loading projects...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Project Operations & Analytics</h1>
          <p className="text-sm text-slate-500">
            Track active initiatives, team allocations, project labor hours, and total costs.
          </p>
        </div>

        {isManager && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-ccp-500 hover:bg-ccp-600 text-white font-bold text-xs rounded-xl shadow-md transition"
          >
            <Plus size={16} />
            <span>New Project</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex items-center gap-2 px-2">
          <Search size={18} className="text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full text-sm outline-none"
          />
        </div>

        <div className="flex items-center gap-1 border-t sm:border-t-0 sm:border-l sm:pl-3 pt-2 sm:pt-0">
          {(['ALL', 'ACTIVE', 'COMPLETED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${statusFilter === st ? 'bg-ccp-700 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects?.map((proj: any) => (
          <div
            key={proj.id}
            className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between space-y-4"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-ccp-50 text-ccp-700 border border-ccp-200">
                  {proj.code}
                </span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${proj.isActive
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-500'
                    }`}
                >
                  {proj.isActive ? 'Active' : 'Completed'}
                </span>
              </div>

              <h2 className="text-base font-bold text-slate-900">{proj.name}</h2>
              <p className="text-xs text-slate-500 mt-1 line-clamp-2">{proj.description}</p>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="space-y-1.5 text-xs text-slate-500">
                <div className="flex items-center justify-between">
                  <span>Start: {new Date(proj.startDate).toLocaleDateString()}</span>
                  <span>{proj.members?.length || 0} members</span>
                </div>

                {/* 🔴 END DATE & REMAINING TIME BADGE */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-50">
                  <span>
                    End: {proj.endDate ? new Date(proj.endDate).toLocaleDateString() : 'No deadline'}
                  </span>
                  {proj.endDate && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${getTimeRemaining(proj.endDate).isUrgent
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                    >
                      {getTimeRemaining(proj.endDate).text}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setManagingProject(proj)}
                    className="text-xs font-semibold text-ccp-700 hover:text-ccp-800 flex items-center gap-1"
                  >
                    <Users size={14} />
                    <span>Team</span>
                  </button>

                  <button
                    onClick={() => setAnalyticsProject(proj)}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 ml-2"
                  >
                    <DollarSign size={14} />
                    <span>Cost & Time</span>
                  </button>

                  {isManager && (
                    <button
                      type="button"
                      onClick={() => openEditModal(proj)}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 ml-2"
                      title="Edit Project Details"
                    >
                      <Pencil size={13} />
                      <span>Edit</span>
                    </button>
                  )}
                </div>

                {isCeo && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        toggleStatusMutation.mutate({ id: proj.id, isActive: !proj.isActive })
                      }
                      title={proj.isActive ? 'Mark as Completed' : 'Mark as Active'}
                      className="text-slate-400 hover:text-slate-700"
                    >
                      <Archive size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete project "${proj.name}"?`)) {
                          deleteProjectMutation.mutate(proj.id);
                        }
                      }}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CREATE PROJECT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Create New Project</h2>
            <p className="text-xs text-slate-500 mb-4">Add a new initiative to the company roster.</p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createProjectMutation.mutate({
                  code,
                  name,
                  description,
                  startDate,
                  endDate: endDate || undefined,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Project Code</label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="PRJ-ALPHA"
                  className="w-full px-3 py-2 text-sm border rounded-lg uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Customer Portal Overhaul"
                  className="w-full px-3 py-2 text-sm border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Briefly define scope and requirements..."
                  className="w-full px-3 py-2 text-sm border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Date (Optional)</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createProjectMutation.isPending}
                  className="px-5 py-2 bg-ccp-500 hover:bg-ccp-600 text-white text-xs font-bold rounded-lg transition"
                >
                  {createProjectMutation.isPending ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANAGE TEAM MODAL */}
      {managingProject && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">{managingProject.name}</h2>
                <p className="text-xs text-slate-500">Team Membership & Project Leads</p>
              </div>
              <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-1 rounded">
                {managingProject.code}
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto divide-y bg-slate-50 rounded-xl p-2 border">
              {managingProject.members?.map((m: any) => (
                <div key={m.id} className="py-2 px-2 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-800">
                      {m.employee.firstName} {m.employee.lastName}
                    </span>
                    {m.isProjectLead && (
                      <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-ccp-50 text-ccp-700">
                        Lead
                      </span>
                    )}
                  </div>
                  {isManager && (
                    <button
                      onClick={() =>
                        removeMemberMutation.mutate({
                          projectId: managingProject.id,
                          employeeId: m.employee.id,
                        })
                      }
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {isManager && (
              <div className="flex gap-2 pt-2">
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs border rounded-lg"
                >
                  <option value="">-- Add Team Member --</option>
                  {employees?.map((emp: any) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeCode})
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={isLead}
                    onChange={(e) => setIsLead(e.target.checked)}
                  />
                  <span>Lead</span>
                </label>
                <button
                  onClick={() =>
                    assignMemberMutation.mutate({
                      projectId: managingProject.id,
                      data: { employeeId: selectedEmployeeId, isProjectLead: isLead },
                    })
                  }
                  disabled={!selectedEmployeeId}
                  className="px-3 py-2 bg-ccp-700 text-white text-xs font-bold rounded-lg"
                >
                  Add
                </button>
              </div>
            )}

            <div className="flex justify-end pt-3">
              <button
                onClick={() => setManagingProject(null)}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROJECT COST & TIME ANALYTICS MODAL */}
      {analyticsProject && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Project Financial & Labor Audit</h2>
                <p className="text-xs text-slate-500">{analyticsProject.name}</p>
              </div>
              {isCeo && costAnalytics?.totalProjectCost !== null && (
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Total Project Cost</div>
                  <div className="text-lg font-black text-ccp-700">
                    ${costAnalytics?.totalProjectCost?.toFixed(2)} USD
                  </div>
                </div>
              )}
            </div>

            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b">
                  <tr>
                    <th className="p-2">Employee</th>
                    <th className="p-2">Time Spent</th>
                    {isCeo && <th className="p-2">Hourly Rate</th>}
                    {isCeo && <th className="p-2 text-right">Labor Cost</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {costAnalytics?.employeeBreakdown?.map((item: any) => (
                    <tr key={item.employeeId}>
                      <td className="p-2 font-semibold text-slate-800">{item.name}</td>
                      <td className="p-2 font-mono">{item.totalHours} hrs</td>
                      {isCeo && <td className="p-2 font-mono">${item.baseHourlyRate}/hr</td>}
                      {isCeo && (
                        <td className="p-2 text-right font-mono font-bold text-slate-900">
                          ${item.cost?.toFixed(2)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setAnalyticsProject(null)}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PROJECT MODAL */}
      {editingProject && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-3 border-b pb-2">
              <h2 className="text-base font-bold text-slate-900">Edit Project Details</h2>
              <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded">
                {editingProject.code}
              </span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateProjectMutation.mutate({
                  id: editingProject.id,
                  data: {
                    name: editName,
                    description: editDescription,
                    startDate: editStartDate,
                    endDate: editEndDate || null,
                  },
                });
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingProject(null)}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateProjectMutation.isPending}
                  className="px-5 py-2 bg-ccp-700 hover:bg-ccp-800 text-white text-xs font-bold rounded-lg transition"
                >
                  {updateProjectMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};