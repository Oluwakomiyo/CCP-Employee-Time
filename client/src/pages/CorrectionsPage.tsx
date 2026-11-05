import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { invalidateAllTimeQueries } from '../lib/sync';
import { useAuth } from '../context/AuthContext';
import { Clock, ArrowRight, Pencil, Trash2 } from 'lucide-react';

export const CorrectionsPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isManagement = user?.role === 'CEO_ADMIN' || user?.role === 'PROJECT_MANAGER';

  const [filterStatus, setFilterStatus] = useState<string>('');
  const [reviewModalRequest, setReviewModalRequest] = useState<any | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const [editingCorrection, setEditingCorrection] = useState<any | null>(null);
  const [editReason, setEditReason] = useState('');
  const [editClockIn, setEditClockIn] = useState('');
  const [editClockOut, setEditClockOut] = useState('');

  // 1. Fetch corrections list with optional status filter
  const { data: corrections, isLoading } = useQuery({
    queryKey: ['correctionsList', filterStatus],
    queryFn: async () => {
      const url = filterStatus ? `/corrections?status=${filterStatus}` : '/corrections';
      const res = await api.get(url);
      return res.data.data;
    },
  });

  const updateCorrectionMutation = useMutation({
    mutationFn: ({ id, data }: any) => api.patch(`/corrections/${id}`, data),
    onSuccess: () => {
      invalidateAllTimeQueries(queryClient);
      setEditingCorrection(null);
      alert('Correction request updated!');
    },
    onError: (err: any) => alert(err.response?.data?.message || 'Failed to update request'),
  });

  const deleteCorrectionMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/corrections/${id}`),
    onSuccess: () => {
      invalidateAllTimeQueries(queryClient);
      alert('Correction request deleted.');
    },
    onError: (err: any) => alert(err.response?.data?.message || 'Failed to delete request'),
  });

  const openEditModal = (req: any) => {
    setEditingCorrection(req);
    setEditReason(req.reason);
    setEditClockIn(new Date(req.requestedChanges.proposedClockIn).toISOString().slice(0, 16));
    setEditClockOut(new Date(req.requestedChanges.proposedClockOut).toISOString().slice(0, 16));
  };

  // Review (Approve/Reject) Mutation
  const reviewMutation = useMutation({
    mutationFn: ({ id, status, reviewNotes }: any) =>
      api.patch(`/corrections/${id}/review`, { status, reviewNotes }),
    onSuccess: () => {
      setReviewModalRequest(null);
      setReviewNotes('');
      queryClient.invalidateQueries({ queryKey: ['correctionsList'] });
      alert('Correction reconciled successfully!');
    },
  });

  if (isLoading) return <div className="p-8 text-slate-500 font-medium">Loading requests...</div>;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Shift Correction Workflow</h1>
        <p className="text-sm text-slate-500">
          Formal auditable process for reconciling forgotten punches, off-site meetings, and auto-closed shifts.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-slate-200 gap-6 text-sm font-semibold text-slate-500">
        {[
          { label: 'All Requests', value: '' },
          { label: 'Pending Review', value: 'PENDING' },
          { label: 'Approved', value: 'APPROVED' },
          { label: 'Rejected', value: 'REJECTED' },
          { label: 'Cancelled', value: 'CANCELLED' },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setFilterStatus(tab.value)}
            className={`pb-3 transition relative ${filterStatus === tab.value
              ? 'text-ccp-700 border-b-2 border-ccp-700'
              : 'hover:text-slate-800'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Corrections List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
        {corrections?.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            No correction requests found matching this filter.
          </div>
        ) : (
          corrections?.map((req: any) => {
            const changes = req.requestedChanges || {};
            const isOwnRequest = user?.employee?.id === req.employee?.id || user?.employee?.id === req.employeeId;
            const isCeo = user?.role === 'CEO_ADMIN';

            // 🔴 CEO can edit/delete any request; employees can edit/delete their own
            const canEdit = (isOwnRequest || isCeo) && req.status === 'PENDING';
            const canDelete = isOwnRequest || isCeo;

            return (
              <div
                key={req.id}
                className="p-6 hover:bg-slate-50/80 transition flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                <div className="space-y-2 flex-1">
                  {/* Status & Identity Header */}
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-900 text-sm">
                      {req.employee.firstName} {req.employee.lastName}
                    </span>
                    <span className="font-mono text-xs text-slate-400">
                      {req.employee.employeeCode}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${req.status === 'APPROVED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : req.status === 'REJECTED'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : req.status === 'CANCELLED'
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                    >
                      {req.status}
                    </span>
                  </div>

                  {/* Reason text */}
                  <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
                    <span className="font-semibold text-slate-900">Reason: </span>
                    {req.reason}
                  </p>

                  {/* Proposed Time Adjustments Box */}
                  <div className="flex items-center gap-3 text-xs font-mono text-slate-600 bg-ccp-50/50 p-2 rounded border border-ccp-100">
                    <Clock size={14} className="text-ccp-600" />
                    <span>
                      Proposed Clock-In:{' '}
                      <b>{new Date(changes.proposedClockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>
                    </span>
                    <ArrowRight size={13} className="text-slate-400" />
                    <span>
                      Proposed Clock-Out:{' '}
                      <b>{new Date(changes.proposedClockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b>
                    </span>
                  </div>

                  {/* Review Notes (If already reviewed) */}
                  {req.reviewNotes && (
                    <div className="text-[11px] text-slate-500 italic">
                      Management Notes: "{req.reviewNotes}" — Reviewed by {req.reviewer?.email}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Edit Button */}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => openEditModal(req)}
                      className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                      title="Edit Correction Details"
                    >
                      <Pencil size={15} />
                    </button>
                  )}

                  {/* Delete Button */}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Permanently delete this correction request?')) {
                          deleteCorrectionMutation.mutate(req.id);
                        }
                      }}
                      className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Delete Request"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}

                  {/* Management Review Button */}
                  {isManagement && req.status === 'PENDING' && !isOwnRequest && (
                    <button
                      type="button"
                      onClick={() => setReviewModalRequest(req)}
                      className="px-4 py-2 bg-ccp-700 hover:bg-ccp-800 text-white text-xs font-bold rounded-lg shadow-sm transition"
                    >
                      Review & Reconcile
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Management Review Modal */}
      {reviewModalRequest && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Review Shift Correction</h2>
              <p className="text-xs text-slate-500">
                Submitted by {reviewModalRequest.employee.firstName}{' '}
                {reviewModalRequest.employee.lastName} ({reviewModalRequest.employee.employeeCode})
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Management Audit Note
              </label>
              <textarea
                rows={3}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="E.g., Confirmed with project site supervisor log..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-ccp-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReviewModalRequest(null)}
                className="px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  reviewMutation.mutate({
                    id: reviewModalRequest.id,
                    status: 'REJECTED',
                    reviewNotes,
                  })
                }
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() =>
                  reviewMutation.mutate({
                    id: reviewModalRequest.id,
                    status: 'APPROVED',
                    reviewNotes,
                  })
                }
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition shadow"
              >
                Approve & Apply Hours
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT CORRECTION MODAL */}
      {editingCorrection && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Edit Correction Request</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateCorrectionMutation.mutate({
                  id: editingCorrection.id,
                  data: {
                    reason: editReason.trim(),
                    requestedChanges: {
                      ...editingCorrection.requestedChanges,
                      proposedClockIn: new Date(editClockIn).toISOString(),
                      proposedClockOut: new Date(editClockOut).toISOString(),
                    },
                  },
                });
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Clock-In</label>
                  <input
                    type="datetime-local"
                    required
                    value={editClockIn}
                    onChange={(e) => setEditClockIn(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Clock-Out</label>
                  <input
                    type="datetime-local"
                    required
                    value={editClockOut}
                    onChange={(e) => setEditClockOut(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason</label>
                <textarea
                  rows={3}
                  required
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs border rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCorrection(null)}
                  className="px-3 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateCorrectionMutation.isPending}
                  className="px-4 py-2 bg-ccp-700 hover:bg-ccp-800 text-white text-xs font-bold rounded-lg transition"
                >
                  {updateCorrectionMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};