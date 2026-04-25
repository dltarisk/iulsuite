import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { fmt } from '../utils/commission';

const STATUS_OPTIONS = ['New', 'Reviewed', 'Converted', 'Archived'];

const STATUS_COLORS = {
  New: 'bg-blue-100 text-blue-800',
  Reviewed: 'bg-yellow-100 text-yellow-800',
  Converted: 'bg-green-100 text-green-800',
  Archived: 'bg-gray-100 text-gray-600',
};

const DEAL_STATUS_COLORS = {
  Submitted: 'bg-blue-100 text-blue-800',
  Issued: 'bg-amber-100 text-amber-800',
  'Issued Paid': 'bg-emerald-100 text-emerald-800',
  Declined: 'bg-red-100 text-red-800',
};

export default function PreApplications() {
  const { agent, supabase } = useAuth();
  const [preapps, setPreapps] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Modal states
  const [reassignTarget, setReassignTarget] = useState(null); // pre-app to reassign
  const [reassignToAgent, setReassignToAgent] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null); // pre-app to delete

  const canSeeAll = agent.role === 'admin' || agent.role === 'admin_agent';

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    let query = supabase
      .from('preapplications')
      .select('*, deal:deals(id, status, ap, date_submitted)')
      .order('created_at', { ascending: false });
    if (!canSeeAll) {
      if (agent.agent_code) {
        query = query.or(`agent_id.eq.${agent.id},agent_code.eq.${agent.agent_code}`);
      } else {
        query = query.eq('agent_id', agent.id);
      }
    }
    const [preappRes, agentRes] = await Promise.all([
      query,
      supabase.from('agents').select('id, name, agent_code').eq('active', true).neq('role', 'admin').order('name'),
    ]);
    if (preappRes.error) console.error('[PreApplications] fetch error:', preappRes.error);
    if (preappRes.data) setPreapps(preappRes.data);
    if (agentRes.data) setAgents(agentRes.data);
    setLoading(false);
  }

  async function updateStatus(id, newStatus) {
    const { error } = await supabase
      .from('preapplications')
      .update({ status: newStatus })
      .eq('id', id);
    if (error) {
      console.error('[PreApplications] updateStatus error:', error);
      alert(`Failed to update status: ${error.message}`);
      return;
    }
    setPreapps((prev) => prev.map((p) => (p.id === id ? { ...p, status: newStatus } : p)));
  }

  async function toggleArchive(id, currentArchived) {
    const { error } = await supabase
      .from('preapplications')
      .update({ archived: !currentArchived })
      .eq('id', id);
    if (error) {
      console.error('[PreApplications] archive error:', error);
      alert(`Failed to ${currentArchived ? 'unarchive' : 'archive'}: ${error.message}`);
      return;
    }
    setPreapps((prev) => prev.map((p) => (p.id === id ? { ...p, archived: !currentArchived } : p)));
  }

  async function confirmReassign() {
    if (!reassignTarget || !reassignToAgent) return;
    const newAgent = agents.find((a) => a.id === reassignToAgent);
    if (!newAgent) return;
    const { error } = await supabase
      .from('preapplications')
      .update({
        agent_id: newAgent.id,
        agent_code: newAgent.agent_code || null,
      })
      .eq('id', reassignTarget.id);
    if (error) {
      console.error('[PreApplications] reassign error:', error);
      alert(`Failed to reassign: ${error.message}`);
      return;
    }
    setReassignTarget(null);
    setReassignToAgent('');
    await fetchData();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from('preapplications')
      .delete()
      .eq('id', deleteTarget.id);
    if (error) {
      console.error('[PreApplications] delete error:', error);
      alert(`Failed to delete: ${error.message}`);
      return;
    }
    setDeleteTarget(null);
    setPreapps((prev) => prev.filter((p) => p.id !== deleteTarget.id));
  }

  const agentMap = useMemo(() => {
    const m = {};
    for (const a of agents) m[a.id] = a;
    return m;
  }, [agents]);

  const filtered = useMemo(() => {
    let list = preapps;
    if (!showArchived) list = list.filter((p) => !p.archived);
    if (filterStatus) list = list.filter((p) => p.status === filterStatus);
    if (filterAgent) list = list.filter((p) => p.agent_id === filterAgent);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((p) => {
        const name = (p.client_name || '').toLowerCase();
        const email = (p.client_email || '').toLowerCase();
        const phone = (p.client_phone || '').toLowerCase();
        const plan = (p.plan || '').toLowerCase();
        return name.includes(q) || email.includes(q) || phone.includes(q) || plan.includes(q);
      });
    }
    return list;
  }, [preapps, filterStatus, filterAgent, searchQuery, showArchived]);

  function formatDate(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function renderFormDetails(formData) {
    if (!formData) return <p className="text-gray-400 text-sm">No form data</p>;
    const personal = ['first_name', 'last_name', 'phone', 'email', 'dob', 'ssn', 'gender', 'address', 'city', 'state', 'zip'];
    const employment = ['employer', 'occupation', 'income', 'annual_income'];
    const insurance = ['plan', 'monthly_premium', 'face_amount', 'tobacco'];
    const skip = ['recipient', 'recipient_name', 'recipient_email', 'language', 'beneficiariesList'];

    const renderGroup = (title, keys) => {
      const entries = keys
        .filter((k) => formData[k] !== undefined && formData[k] !== '')
        .map((k) => [k, formData[k]]);
      if (entries.length === 0) return null;
      return (
        <div key={title} className="mb-3">
          <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">{title}</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
            {entries.map(([k, v]) => (
              <div key={k}>
                <span className="text-xs text-gray-400">{k.replace(/_/g, ' ')}:</span>{' '}
                <span className="text-sm font-medium">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      );
    };

    const bens = formData.beneficiariesList || [];
    const knownKeys = new Set([...personal, ...employment, ...insurance, ...skip]);
    const other = Object.entries(formData).filter(
      ([k]) => !knownKeys.has(k) && !k.startsWith('ben_')
    );

    return (
      <div className="bg-gray-50 rounded-lg p-4 mt-2 border border-nord-border">
        {renderGroup('Personal Information', personal)}
        {renderGroup('Employment', employment)}
        {renderGroup('Insurance Details', insurance)}
        {bens.length > 0 && (
          <div className="mb-3">
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">Beneficiaries</h4>
            <div className="space-y-1">
              {bens.map((b, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium">{b.name}</span>
                  {b.relationship && <span className="text-gray-500"> ({b.relationship})</span>}
                  {b.dob && <span className="text-gray-400 ml-2">DOB: {b.dob}</span>}
                  {b.percentage && <span className="text-emerald-600 ml-2 font-bold">{b.percentage}%</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        {other.length > 0 && (
          <div className="mb-3">
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">Other</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
              {other.map(([k, v]) => (
                <div key={k}>
                  <span className="text-xs text-gray-400">{k.replace(/_/g, ' ')}:</span>{' '}
                  <span className="text-sm font-medium">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400">
        Loading pre-applications...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
          <h2 className="text-xl font-bold text-navy">Pre-Applications</h2>
          <div className="flex gap-2 flex-wrap items-center">
            {/* Search */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, email, phone..."
                className="border rounded px-3 py-1.5 text-sm pl-8 w-60 focus:outline-none focus:border-emerald-400"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              )}
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm"
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {canSeeAll && (
              <select
                value={filterAgent}
                onChange={(e) => setFilterAgent(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm"
              >
                <option value="">All Agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} {a.agent_code ? `(${a.agent_code})` : ''}
                  </option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="accent-emerald-500"
              />
              Show archived
            </label>
            <button
              onClick={fetchData}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-sm font-medium"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="text-sm text-gray-500 mb-3">
          {filtered.length} pre-application{filtered.length !== 1 ? 's' : ''}
          {showArchived && <span className="ml-2 text-xs text-gray-400">(including archived)</span>}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-4xl mb-2">📋</p>
            <p>No pre-applications found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((pa) => {
              const isExpanded = expandedId === pa.id;
              const agentName = pa.agent_id && agentMap[pa.agent_id]
                ? agentMap[pa.agent_id].name
                : pa.agent_code || 'Unassigned';
              const linkedDeal = pa.deal;

              return (
                <div
                  key={pa.id}
                  className={`border rounded-lg overflow-hidden ${pa.archived ? 'opacity-60 bg-gray-50' : ''}`}
                >
                  {/* Summary row */}
                  <div
                    className="flex flex-col md:flex-row md:items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedId(isExpanded ? null : pa.id)}
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <span className="text-lg">{isExpanded ? '▼' : '▶'}</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-navy truncate">
                          {pa.client_name || 'Unknown Client'}
                          {pa.archived && <span className="ml-2 text-xs text-gray-400 font-normal">(archived)</span>}
                        </p>
                        <p className="text-xs text-gray-400">
                          {pa.client_phone || ''} {pa.client_email ? `• ${pa.client_email}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mt-2 md:mt-0 flex-wrap">
                      {pa.plan && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          {pa.plan}
                        </span>
                      )}
                      {pa.monthly_premium && (
                        <span className="text-sm font-bold text-emerald-600">
                          {fmt(pa.monthly_premium * 12)}/yr
                        </span>
                      )}
                      <span className="text-xs text-gray-500">{agentName}</span>
                      {linkedDeal ? (
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-bold ${DEAL_STATUS_COLORS[linkedDeal.status] || 'bg-gray-100 text-gray-600'}`}
                          title="Linked deal status"
                        >
                          🔗 {linkedDeal.status}
                        </span>
                      ) : (
                        <span className={`text-xs px-2 py-1 rounded-full font-bold ${STATUS_COLORS[pa.status] || ''}`}>
                          {pa.status}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {formatDate(pa.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t px-4 pb-4">
                      {/* Status + actions */}
                      <div className="flex gap-2 mt-3 mb-2 flex-wrap items-center">
                        <span className="text-xs font-semibold text-gray-500 uppercase mr-1">Status:</span>
                        {STATUS_OPTIONS.map((s) => (
                          <button
                            key={s}
                            onClick={(e) => {
                              e.stopPropagation();
                              updateStatus(pa.id, s);
                            }}
                            className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                              pa.status === s
                                ? 'bg-navy text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {s}
                          </button>
                        ))}

                        <div className="ml-auto flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setReassignTarget(pa);
                              setReassignToAgent(pa.agent_id || '');
                            }}
                            className="px-3 py-1.5 text-xs font-semibold rounded bg-gold text-white hover:opacity-90"
                            title="Reassign to another agent"
                          >
                            ↪ Reassign
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleArchive(pa.id, pa.archived);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                          >
                            {pa.archived ? '📤 Unarchive' : '📥 Archive'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(pa);
                            }}
                            className="px-3 py-1.5 text-xs font-semibold rounded bg-red-50 text-red-600 hover:bg-red-100"
                          >
                            🗑 Delete
                          </button>
                        </div>
                      </div>

                      {linkedDeal && (
                        <div className="mb-2 p-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-900">
                          🔗 Linked to deal — AP: <strong>{fmt(linkedDeal.ap)}</strong> · Status: <strong>{linkedDeal.status}</strong>
                          {linkedDeal.date_submitted && ` · Submitted ${linkedDeal.date_submitted}`}
                        </div>
                      )}

                      {renderFormDetails(pa.form_data)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reassign modal */}
      {reassignTarget && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setReassignTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-navy text-lg mb-2">Reassign Pre-Application</h3>
            <p className="text-sm text-gray-600 mb-4">
              Move <strong>{reassignTarget.client_name || 'this pre-application'}</strong> to another agent.
            </p>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">New agent</label>
            <select
              value={reassignToAgent}
              onChange={(e) => setReassignToAgent(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-4"
            >
              <option value="">Select agent...</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} {a.agent_code ? `(${a.agent_code})` : ''}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReassignTarget(null)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmReassign}
                disabled={!reassignToAgent}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                Reassign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-navy text-lg mb-2">Delete Pre-Application?</h3>
            <p className="text-sm text-gray-600 mb-4">
              This will permanently delete the pre-application for{' '}
              <strong>{deleteTarget.client_name || 'this client'}</strong>. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
