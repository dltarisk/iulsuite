import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { fmt } from '../utils/commission';
import { FUNCTIONS_URL, ANON_KEY } from '../supabaseClient';

const ROLES = [
  { value: 'admin_agent', label: 'Admin Agent' },
  { value: 'agent', label: 'Agent' },
  { value: 'ceo', label: 'CEO' },
];

const roleBadgeClass = (role) => {
  if (role === 'admin_agent') return 'bg-[#d4a853]/20 text-[#a07d30]';
  if (role === 'ceo') return 'bg-purple-100 text-purple-700';
  return 'bg-gray-100 text-gray-600';
};

const roleLabel = (role) => {
  if (role === 'admin_agent') return 'Admin Agent';
  if (role === 'ceo') return 'CEO';
  return 'Agent';
};

function getMonthOptions() {
  const opts = [];
  const now = new Date();
  for (let i = -3; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    opts.push({ value, label });
  }
  return opts;
}

export default function AdminPanel() {
  const { supabase, token, agent: currentAgent } = useAuth();
  const [editing, setEditing] = useState(false);
  const [teamGoal, setTeamGoal] = useState(90000);
  const [goalMonth, setGoalMonth] = useState('2026-03');
  const [agents, setAgents] = useState([]);
  const [editedAgents, setEditedAgents] = useState([]);
  const [editedGoal, setEditedGoal] = useState('');
  const [editedMonth, setEditedMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveInfo, setSaveInfo] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, name }
  const canDelete = currentAgent.role === 'admin' || currentAgent.role === 'admin_agent';

  // Commission change form
  const [compChangeAgent, setCompChangeAgent] = useState('');
  const [compChangeRate, setCompChangeRate] = useState('');
  const [compChangeOverrideRate, setCompChangeOverrideRate] = useState('');
  const [personalMatchesOverride, setPersonalMatchesOverride] = useState(true);
  const [compChangeDate, setCompChangeDate] = useState(new Date().toISOString().slice(0, 10));
  const [compChangeSaving, setCompChangeSaving] = useState(false);
  const [compChangeHistory, setCompChangeHistory] = useState([]);

  const monthOptions = getMonthOptions();

  async function loadAll() {
    const [settingsRes, agentsRes, changesRes] = await Promise.all([
      supabase.from('team_settings').select('monthly_goal, goal_month').single(),
      supabase.from('agents').select('*').order('name'),
      supabase.from('comp_rate_changes').select('*, agent:agents(name), changer:agents!comp_rate_changes_changed_by_fkey(name)').order('effective_date', { ascending: false }),
    ]);
    if (settingsRes.data) {
      setTeamGoal(settingsRes.data.monthly_goal);
      setGoalMonth(settingsRes.data.goal_month || '2026-03');
    }
    if (agentsRes.data) setAgents(agentsRes.data);
    if (changesRes.data) setCompChangeHistory(changesRes.data);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, [supabase]);

  const startEditing = () => {
    setEditing(true);
    setEditedGoal(String(teamGoal));
    setEditedMonth(goalMonth);
    setEditedAgents(
      agents.filter((a) => a.role !== 'admin').map((a) => {
        const overrideVal = a.override_rate != null ? Number(a.override_rate) : Number(a.comp_rate);
        return {
          ...a,
          pin: '',
          comp_rate_display: `${(Number(a.comp_rate) * 100).toFixed(0)}%`,
          override_rate_display: `${(overrideVal * 100).toFixed(0)}%`,
          goal_display: String(a.monthly_goal),
        };
      })
    );
  };

  const updateEditedAgent = (idx, field, value) => {
    setEditedAgents((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  // Generate next sequential 6-digit agent_code (max existing + 1, min 000002)
  const generateNextAgentCode = () => {
    const codes = agents
      .map((a) => a.agent_code)
      .filter((c) => c && /^\d+$/.test(c))
      .map((c) => parseInt(c, 10));
    const next = Math.max(1, ...codes) + 1;
    return String(next).padStart(6, '0');
  };

  const addAgent = () => {
    const nextCode = generateNextAgentCode();
    setEditedAgents((prev) => [
      ...prev,
      {
        id: null, name: '', role: 'agent', recruiter_id: null,
        pin: '', comp_rate: 0.5, comp_rate_display: '50%',
        override_rate: null, override_rate_display: '50%',
        monthly_goal: 20000, goal_display: '20000', active: true,
        agent_code: nextCode, email: '',
      },
    ]);
  };

  const removeEditedAgent = (idx) => {
    setEditedAgents((prev) => prev.filter((_, i) => i !== idx));
  };

  const deleteAgent = async (id, name) => {
    setSaveError('');
    setSaveInfo('');
    try {
      console.log('[AdminPanel] Deleting agent', { id, name });
      // Try hard delete first
      const { error } = await supabase.from('agents').delete().eq('id', id);
      if (error) {
        console.error('[AdminPanel] Hard delete failed:', error);
        // Fall back to soft delete (deactivate) if FK constraint blocks
        if (error.code === '23503' || /foreign key/i.test(error.message)) {
          const { error: softErr } = await supabase.from('agents').update({
            active: false, updated_at: new Date().toISOString(),
          }).eq('id', id);
          if (softErr) {
            setSaveError(`Delete failed for ${name}: ${softErr.message}`);
            return;
          }
          setSaveInfo(`${name} has existing deals and cannot be fully deleted — deactivated instead.`);
        } else {
          setSaveError(`Delete failed for ${name}: ${error.message}`);
          return;
        }
      } else {
        setSaveInfo(`${name} deleted.`);
      }
      await loadAll();
    } catch (e) {
      console.error('[AdminPanel] Delete exception:', e);
      setSaveError(`Delete exception: ${e.message}`);
    } finally {
      setConfirmDelete(null);
    }
  };

  const saveChanges = async () => {
    console.log('[AdminPanel] saveChanges invoked', { editedAgents: editedAgents.length });
    setSaving(true);
    setSaveError('');
    setSaveInfo('');
    const errors = [];
    const skipped = [];
    try {
      const goalNum = parseInt(editedGoal.replace(/\D/g, ''));
      if (goalNum > 0) {
        const { error: settingsErr } = await supabase.from('team_settings').update({
          monthly_goal: goalNum, goal_month: editedMonth,
          updated_at: new Date().toISOString(),
        }).eq('id', 1);
        if (settingsErr) errors.push(`Team settings: ${settingsErr.message}`);
      }

      for (const ea of editedAgents) {
        const compNum = parseFloat(ea.comp_rate_display.replace('%', '')) / 100;
        const overrideNum = parseFloat((ea.override_rate_display || ea.comp_rate_display).replace('%', '')) / 100;
        const goalVal = parseInt(ea.goal_display.replace(/\D/g, ''));

        const updates = {
          name: ea.name, role: ea.role, comp_rate: compNum,
          override_rate: overrideNum,
          monthly_goal: goalVal || 0, active: ea.active,
          recruiter_id: ea.recruiter_id || null,
          agent_code: ea.agent_code || null,
          email: ea.email || null,
          updated_at: new Date().toISOString(),
        };

        if (ea.pin && ea.pin.length === 4) {
          try {
            const hashRes = await fetch(`${FUNCTIONS_URL}/hash-pin`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ pin: ea.pin }),
            });
            const hashData = await hashRes.json();
            if (hashData.hash) updates.pin_hash = hashData.hash;
            else errors.push(`${ea.name || 'new agent'}: PIN hash failed`);
          } catch (e) {
            errors.push(`${ea.name || 'new agent'}: PIN hash error - ${e.message}`);
          }
        }

        if (ea.id) {
          console.log('[AdminPanel] Updating agent', ea.id, updates);
          const { error, data } = await supabase.from('agents').update(updates).eq('id', ea.id).select();
          if (error) {
            console.error('[AdminPanel] Update error for', ea.name, error);
            errors.push(`${ea.name}: ${error.message}${error.hint ? ' (' + error.hint + ')' : ''}`);
          } else {
            console.log('[AdminPanel] Update OK', data);
          }
        } else {
          if (!updates.pin_hash) {
            skipped.push(`${ea.name || '(unnamed)'} — new agents require a 4-digit PIN`);
            continue;
          }
          if (!updates.name) {
            skipped.push('New agent missing name');
            continue;
          }
          console.log('[AdminPanel] Inserting new agent', updates);
          const { error, data } = await supabase.from('agents').insert(updates).select();
          if (error) {
            console.error('[AdminPanel] Insert error for', ea.name, error);
            errors.push(`${ea.name}: ${error.message}${error.hint ? ' (' + error.hint + ')' : ''}`);
          } else {
            console.log('[AdminPanel] Insert OK', data);
          }
        }
      }

      if (errors.length > 0 || skipped.length > 0) {
        const parts = [];
        if (errors.length > 0) parts.push('Errors:\n- ' + errors.join('\n- '));
        if (skipped.length > 0) parts.push('Skipped:\n- ' + skipped.join('\n- '));
        setSaveError(parts.join('\n\n'));
      }

      if (errors.length === 0) {
        await loadAll();
        if (skipped.length === 0) setEditing(false);
      } else {
        await loadAll();
      }

      // Scroll banner into view
      if (errors.length > 0 || skipped.length > 0) {
        setTimeout(() => {
          const el = document.getElementById('admin-save-banner');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
      }
    } catch (e) {
      console.error('[AdminPanel] Unexpected save error:', e);
      setSaveError(`Unexpected error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const submitCompChange = async () => {
    if (!compChangeAgent || !compChangeRate || !compChangeDate) return;
    setCompChangeSaving(true);
    try {
      const selectedAgent = agents.find((a) => a.id === compChangeAgent);
      if (!selectedAgent) return;

      const newRate = parseFloat(compChangeRate.replace('%', '')) / 100;
      const previousRate = Number(selectedAgent.comp_rate);

      // Override rate: if checkbox is checked, override = personal; else use separate input
      const newOverrideRate = personalMatchesOverride
        ? newRate
        : parseFloat(compChangeOverrideRate.replace('%', '')) / 100;
      const previousOverrideRate =
        selectedAgent.override_rate != null
          ? Number(selectedAgent.override_rate)
          : Number(selectedAgent.comp_rate);

      // Record the change (includes both personal and override rates)
      await supabase.from('comp_rate_changes').insert({
        agent_id: compChangeAgent,
        previous_rate: previousRate,
        new_rate: newRate,
        previous_override_rate: previousOverrideRate,
        new_override_rate: newOverrideRate,
        effective_date: compChangeDate,
        changed_by: currentAgent.id,
      });

      // If effective date is today or in the past, update agent's current rates
      const today = new Date().toISOString().slice(0, 10);
      if (compChangeDate <= today) {
        await supabase.from('agents').update({
          comp_rate: newRate,
          override_rate: newOverrideRate,
          updated_at: new Date().toISOString(),
        }).eq('id', compChangeAgent);
      }

      setCompChangeAgent('');
      setCompChangeRate('');
      setCompChangeOverrideRate('');
      setPersonalMatchesOverride(true);
      setCompChangeDate(new Date().toISOString().slice(0, 10));
      await loadAll();
    } finally {
      setCompChangeSaving(false);
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  const nonAdminAgents = agents.filter((a) => a.role !== 'admin');

  return (
    <div className="space-y-6">
      {/* Agent Hierarchy & Settings */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-navy text-lg">Agent Hierarchy & Settings</h3>
            <p className="text-sm text-gray-500">Manage agents, commission rates, goals, and team dashboard visibility.</p>
          </div>
          <button
            onClick={editing ? saveChanges : startEditing}
            disabled={saving}
            className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all ${editing ? 'bg-emerald-500 text-white disabled:opacity-50' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            {saving ? 'Saving...' : editing ? 'Save Changes' : 'Edit'}
          </button>
        </div>

        {(saveError || saveInfo) && (
          <div id="admin-save-banner" className="mb-4 space-y-2">
            {saveError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 whitespace-pre-wrap flex items-start justify-between gap-3">
                <div className="flex-1"><strong className="block mb-1">⚠️ Save had problems</strong>{saveError}</div>
                <button onClick={() => setSaveError('')} className="text-red-500 hover:text-red-700 font-bold text-lg leading-none">×</button>
              </div>
            )}
            {saveInfo && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-start justify-between gap-3">
                <div className="flex-1">{saveInfo}</div>
                <button onClick={() => setSaveInfo('')} className="text-blue-500 hover:text-blue-700 font-bold text-lg leading-none">×</button>
              </div>
            )}
          </div>
        )}

        <div className="mb-5 p-4 bg-blue-50 border border-blue-100 rounded-xl">
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Team Monthly Goal (AP)</label>
              {editing ? (
                <input type="text" value={editedGoal} onChange={(e) => setEditedGoal(e.target.value)}
                  className="mt-1 block w-48 border border-gray-300 rounded-lg px-3 py-2 text-lg font-bold text-navy focus:outline-none focus:border-emerald-400" />
              ) : (
                <div className="text-2xl font-bold text-navy mt-1">{fmt(teamGoal)}</div>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase">Goal Month</label>
              {editing ? (
                <select value={editedMonth} onChange={(e) => setEditedMonth(e.target.value)}
                  className="mt-1 block border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold text-navy focus:outline-none focus:border-emerald-400 bg-white">
                  {monthOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              ) : (
                <div className="text-lg font-bold text-navy mt-1">
                  {monthOptions.find((m) => m.value === goalMonth)?.label || goalMonth}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Agent Name</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Agent ID</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Email</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Role</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Reports To</th>
                <th className="text-center py-3 px-3 text-xs font-semibold text-gray-500 uppercase">PIN</th>
                <th className="text-center py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Personal</th>
                <th className="text-center py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Override</th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Ind. Goal</th>
                <th className="text-center py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Active</th>
                {canDelete && <th className="text-center py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {editing
                ? editedAgents.map((a, idx) => (
                    <tr key={a.id || `new-${idx}`} className="border-b border-gray-100">
                      <td className="py-3 px-3">
                        <input type="text" value={a.name} onChange={(e) => updateEditedAgent(idx, 'name', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-semibold text-navy focus:outline-none focus:border-emerald-400" />
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-mono text-xs text-gray-500" title="Auto-generated, cannot be changed">
                          {a.agent_code || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <input type="email" value={a.email || ''} onChange={(e) => updateEditedAgent(idx, 'email', e.target.value)}
                          placeholder="email@example.com"
                          className="w-44 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-emerald-400" />
                      </td>
                      <td className="py-3 px-3">
                        <select value={a.role} onChange={(e) => updateEditedAgent(idx, 'role', e.target.value)}
                          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-bold text-navy focus:outline-none focus:border-emerald-400 bg-white">
                          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </td>
                      <td className="py-3 px-3">
                        <select value={a.recruiter_id || ''} onChange={(e) => updateEditedAgent(idx, 'recruiter_id', e.target.value || null)}
                          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-700 focus:outline-none focus:border-emerald-400 bg-white">
                          <option value="">None</option>
                          {nonAdminAgents.filter((x) => x.id !== a.id).map((x) => (
                            <option key={x.id} value={x.id}>{x.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <input type="password" value={a.pin} onChange={(e) => updateEditedAgent(idx, 'pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                          maxLength={4} placeholder="****"
                          className="w-20 text-center border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-bold text-navy focus:outline-none focus:border-emerald-400" />
                      </td>
                      <td className="py-3 px-3 text-center">
                        <input type="text" value={a.comp_rate_display} onChange={(e) => updateEditedAgent(idx, 'comp_rate_display', e.target.value)}
                          className="w-16 text-center border border-gray-300 rounded-lg px-2 py-1 text-sm font-bold text-navy focus:outline-none focus:border-emerald-400" />
                      </td>
                      <td className="py-3 px-3 text-center">
                        <input type="text" value={a.override_rate_display} onChange={(e) => updateEditedAgent(idx, 'override_rate_display', e.target.value)}
                          placeholder="same"
                          className="w-16 text-center border border-gray-300 rounded-lg px-2 py-1 text-sm font-bold text-gold focus:outline-none focus:border-gold" />
                      </td>
                      <td className="py-3 px-3 text-right">
                        <input type="text" value={a.goal_display} onChange={(e) => updateEditedAgent(idx, 'goal_display', e.target.value)}
                          className="w-28 text-right border border-gray-300 rounded-lg px-2 py-1 text-sm font-bold text-navy focus:outline-none focus:border-emerald-400" />
                      </td>
                      <td className="py-3 px-3 text-center">
                        <input type="checkbox" checked={a.active} onChange={(e) => updateEditedAgent(idx, 'active', e.target.checked)}
                          className="w-5 h-5 rounded accent-emerald-500 cursor-pointer" />
                      </td>
                      {canDelete && (
                        <td className="py-3 px-3 text-center">
                          {a.id ? (
                            <button
                              type="button"
                              onClick={() => setConfirmDelete({ id: a.id, name: a.name })}
                              className="px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 rounded"
                              title="Delete agent"
                            >
                              🗑 Delete
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => removeEditedAgent(idx)}
                              className="px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100 rounded"
                              title="Remove new row"
                            >
                              ✕ Remove
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                : nonAdminAgents.map((a) => {
                    const recruiter = agents.find((r) => r.id === a.recruiter_id);
                    return (
                      <tr key={a.id} className="border-b border-gray-100">
                        <td className="py-3 px-3 font-semibold text-navy">{a.name}</td>
                        <td className="py-3 px-3 font-mono text-xs text-gray-500">{a.agent_code || '—'}</td>
                        <td className="py-3 px-3 text-xs text-gray-500">{a.email || '—'}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${roleBadgeClass(a.role)}`}>{roleLabel(a.role)}</span>
                        </td>
                        <td className="py-3 px-3 text-gray-500">{recruiter?.name || '—'}</td>
                        <td className="py-3 px-3 text-center text-gray-400 tracking-widest">&#8226;&#8226;&#8226;&#8226;</td>
                        <td className="py-3 px-3 text-center font-bold text-navy">
                          {(Number(a.comp_rate) * 100).toFixed(0)}%
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-gold">
                          {a.override_rate != null
                            ? `${(Number(a.override_rate) * 100).toFixed(0)}%`
                            : `${(Number(a.comp_rate) * 100).toFixed(0)}%`}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-navy">{fmt(a.monthly_goal)}</td>
                        <td className="py-3 px-3 text-center">
                          <span className={`text-sm font-bold ${a.active ? 'text-emerald-600' : 'text-gray-300'}`}>{a.active ? '\u2713' : '—'}</span>
                        </td>
                        {canDelete && (
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => setConfirmDelete({ id: a.id, name: a.name })}
                              className="px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 rounded"
                              title="Delete agent"
                            >
                              🗑 Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {editing && (
          <div className="mt-4">
            <button onClick={addAgent} className="px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600">+ Add Agent</button>
          </div>
        )}
      </div>

      {/* Commission Rate Change */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="font-bold text-navy text-lg mb-2">Commission Rate Change</h3>
        <p className="text-sm text-gray-500 mb-4">Schedule a commission rate change. Deals submitted before the effective date will use the old rate for commission and override calculations.</p>

        <div className="flex flex-wrap items-end gap-4 mb-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Agent</label>
            <select value={compChangeAgent} onChange={(e) => setCompChangeAgent(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-emerald-400 min-w-[180px]">
              <option value="">Select agent...</option>
              {nonAdminAgents.map((a) => {
                const overrideStr = a.override_rate != null && Number(a.override_rate) !== Number(a.comp_rate)
                  ? ` / ${(Number(a.override_rate) * 100).toFixed(0)}% ovr`
                  : '';
                return (
                  <option key={a.id} value={a.id}>
                    {a.name} ({(Number(a.comp_rate) * 100).toFixed(0)}%{overrideStr})
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Personal Rate</label>
            <input type="text" value={compChangeRate} onChange={(e) => setCompChangeRate(e.target.value)}
              placeholder="e.g. 80%"
              className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm font-bold text-navy focus:outline-none focus:border-emerald-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Override Rate</label>
            <input
              type="text"
              value={personalMatchesOverride ? compChangeRate : compChangeOverrideRate}
              onChange={(e) => setCompChangeOverrideRate(e.target.value)}
              placeholder="e.g. 70%"
              disabled={personalMatchesOverride}
              className={`w-24 border rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-emerald-400 ${
                personalMatchesOverride
                  ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                  : 'border-gray-300 text-navy'
              }`}
            />
          </div>
          <div className="pb-2">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-600">
              <input
                type="checkbox"
                checked={personalMatchesOverride}
                onChange={(e) => {
                  setPersonalMatchesOverride(e.target.checked);
                  if (e.target.checked) setCompChangeOverrideRate('');
                }}
                className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
              />
              Personal matches override
            </label>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Effective Date</label>
            <input type="date" value={compChangeDate} onChange={(e) => setCompChangeDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400" />
          </div>
          <button
            onClick={submitCompChange}
            disabled={
              compChangeSaving ||
              !compChangeAgent ||
              !compChangeRate ||
              (!personalMatchesOverride && !compChangeOverrideRate)
            }
            className="px-5 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-50">
            {compChangeSaving ? 'Saving...' : 'Apply Change'}
          </button>
        </div>

        {compChangeHistory.length > 0 && (
          <>
            <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Change History</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Agent</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Personal From</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Personal To</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Override From</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Override To</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Effective</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Changed By</th>
                  </tr>
                </thead>
                <tbody>
                  {compChangeHistory.map((c) => (
                    <tr key={c.id} className="border-b border-gray-100">
                      <td className="py-2 px-3 font-medium text-navy">{c.agent?.name}</td>
                      <td className="py-2 px-3 text-center text-gray-500">{(Number(c.previous_rate) * 100).toFixed(0)}%</td>
                      <td className="py-2 px-3 text-center font-bold text-navy">{(Number(c.new_rate) * 100).toFixed(0)}%</td>
                      <td className="py-2 px-3 text-center text-gray-500">
                        {c.previous_override_rate != null ? `${(Number(c.previous_override_rate) * 100).toFixed(0)}%` : '—'}
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-navy">
                        {c.new_override_rate != null ? `${(Number(c.new_override_rate) * 100).toFixed(0)}%` : '—'}
                      </td>
                      <td className="py-2 px-3 text-gray-500">{c.effective_date}</td>
                      <td className="py-2 px-3 text-gray-400">{c.changer?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-navy text-lg mb-2">Delete agent?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete <strong>{confirmDelete.name}</strong>? This cannot be undone.
              If the agent has existing deals, they will be deactivated instead.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteAgent(confirmDelete.id, confirmDelete.name)}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Commission Reference */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="font-bold text-navy text-lg mb-2">Commission Reference</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="font-bold text-gray-700 mb-2">Standard (non-NY)</div>
            <div className="text-gray-600">CAR: <span className="font-bold text-navy">75%</span></div>
            <div className="font-mono text-xs bg-white px-2 py-1 rounded border mt-2">AP &times; 0.75 &times; CompRate</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="font-bold text-gray-700 mb-2">New York</div>
            <div className="text-gray-600">CAR: <span className="font-bold text-navy">50%</span> &middot; Comp: <span className="font-bold text-navy">100%</span></div>
            <div className="font-mono text-xs bg-white px-2 py-1 rounded border mt-2">AP &times; 0.50 &times; 1.00</div>
            <div className="text-xs text-gray-400 mt-1">No overrides on NY policies</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="font-bold text-gray-700 mb-2">Override</div>
            <div className="font-mono text-xs bg-white px-2 py-1 rounded border mt-1">AP &times; 0.75 &times; (Head% &minus; Sub%)</div>
            <div className="text-xs text-gray-400 mt-2">e.g. $2,400 &times; 0.75 &times; (60%&minus;40%) = $360</div>
          </div>
        </div>
      </div>
    </div>
  );
}
