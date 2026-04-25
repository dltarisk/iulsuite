import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import StatusBadge from './StatusBadge';
import { fmt, calcCommission } from '../utils/commission';
import { US_STATES } from '../utils/states';

const STATUSES = ['Submitted', 'Issued', 'Issued Paid', 'Declined'];

const STATUS_SELECT_STYLES = {
  Submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  Issued: 'bg-amber-50 text-amber-700 border-amber-200',
  'Issued Paid': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Declined: 'bg-red-50 text-red-700 border-red-200',
};

function getMonthOptions(deals) {
  const months = new Set();
  deals.forEach((d) => {
    if (d.date_submitted) months.add(d.date_submitted.slice(0, 7));
  });
  return Array.from(months)
    .sort()
    .reverse()
    .map((m) => {
      const [y, mo] = m.split('-');
      const label = new Date(Number(y), Number(mo) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return { value: m, label };
    });
}

export default function MyDeals() {
  const { supabase, agent } = useAuth();
  const [deals, setDeals] = useState([]);
  const [notes, setNotes] = useState({});
  const [expandedDeal, setExpandedDeal] = useState(null);
  const [newNote, setNewNote] = useState('');
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [editingDeal, setEditingDeal] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [newDeal, setNewDeal] = useState({ client_name: '', state: '', phone: '', ap: '', is_ny: false, status: 'Submitted', preapp_id: null });
  const [loading, setLoading] = useState(true);

  // From pre-app flow
  const [showPreappPicker, setShowPreappPicker] = useState(false);
  const [availablePreapps, setAvailablePreapps] = useState([]);
  const [preappSearch, setPreappSearch] = useState('');

  const [filterStatus, setFilterStatus] = useState('hide-declined');
  const [filterMonth, setFilterMonth] = useState('');

  const loadDeals = useCallback(async () => {
    const { data } = await supabase
      .from('deals')
      .select('*')
      .eq('agent_id', agent.id)
      .order('date_submitted', { ascending: false });
    if (data) setDeals(data);
    setLoading(false);
  }, [supabase, agent.id]);

  useEffect(() => { loadDeals(); }, [loadDeals]);

  const monthOptions = useMemo(() => getMonthOptions(deals), [deals]);

  const filteredDeals = useMemo(() => {
    let result = deals;
    if (filterStatus === 'hide-declined') {
      result = result.filter((d) => d.status !== 'Declined');
    } else if (filterStatus) {
      result = result.filter((d) => d.status === filterStatus);
    }
    if (filterMonth) result = result.filter((d) => d.date_submitted && d.date_submitted.startsWith(filterMonth));
    return result;
  }, [deals, filterStatus, filterMonth]);

  // Totals for filtered deals
  const totals = useMemo(() => {
    let ap = 0, comm = 0;
    for (const d of filteredDeals) {
      ap += d.ap;
      comm += calcCommission(d.ap, Number(agent.comp_rate), d.is_ny);
    }
    return { ap, comm };
  }, [filteredDeals, agent.comp_rate]);

  const loadNotes = useCallback(async (dealId) => {
    const { data } = await supabase
      .from('deal_notes')
      .select('*, author:agents(name)')
      .eq('deal_id', dealId)
      .order('created_at');
    if (data) setNotes((prev) => ({ ...prev, [dealId]: data }));
  }, [supabase]);

  const toggleExpand = (dealId) => {
    if (expandedDeal === dealId) {
      setExpandedDeal(null);
    } else {
      setExpandedDeal(dealId);
      if (!notes[dealId]) loadNotes(dealId);
    }
  };

  const addNote = async (dealId) => {
    if (!newNote.trim()) return;
    await supabase.from('deal_notes').insert({
      deal_id: dealId,
      author_id: agent.id,
      content: newNote.trim(),
    });
    setNewNote('');
    loadNotes(dealId);
  };

  const updateStatus = async (dealId, status) => {
    const updates = { status, updated_at: new Date().toISOString() };
    // Auto-set date_issued_paid when status changes to 'Issued Paid'
    if (status === 'Issued Paid') {
      updates.date_issued_paid = new Date().toISOString().slice(0, 10);
    }
    await supabase.from('deals').update(updates).eq('id', dealId);
    loadDeals();
  };

  const deleteDeal = async (dealId) => {
    if (!window.confirm('Delete this deal? This cannot be undone.')) return;
    await supabase.from('deal_notes').delete().eq('deal_id', dealId);
    await supabase.from('deals').delete().eq('id', dealId);
    setExpandedDeal(null);
    loadDeals();
  };

  const startEdit = (deal) => {
    setEditingDeal(deal.id);
    setEditForm({
      client_name: deal.client_name,
      state: deal.state || '',
      phone: deal.phone || '',
      ap: String(deal.ap),
      is_ny: deal.is_ny,
      status: deal.status,
      date_submitted: deal.date_submitted || '',
      date_issued_paid: deal.date_issued_paid || '',
    });
  };

  const saveEdit = async (dealId) => {
    if (!editForm.client_name || !editForm.ap) return;
    const updates = {
      client_name: editForm.client_name,
      state: editForm.state,
      phone: editForm.phone,
      ap: parseInt(editForm.ap),
      is_ny: editForm.is_ny,
      status: editForm.status,
      date_submitted: editForm.date_submitted || null,
      date_issued_paid: editForm.date_issued_paid || null,
      updated_at: new Date().toISOString(),
    };
    // Auto-set date_issued_paid if status changed to 'Issued Paid' and no date set
    if (editForm.status === 'Issued Paid' && !editForm.date_issued_paid) {
      updates.date_issued_paid = new Date().toISOString().slice(0, 10);
    }
    await supabase.from('deals').update(updates).eq('id', dealId);
    setEditingDeal(null);
    loadDeals();
  };

  const cancelEdit = () => {
    setEditingDeal(null);
    setEditForm({});
  };

  const createDeal = async () => {
    if (!newDeal.client_name || !newDeal.ap) return;
    const { data: insertedDeals, error } = await supabase
      .from('deals')
      .insert({
        agent_id: agent.id,
        client_name: newDeal.client_name,
        state: newDeal.state,
        phone: newDeal.phone,
        ap: parseInt(newDeal.ap),
        is_ny: newDeal.is_ny,
        status: newDeal.status,
        date_submitted: new Date().toISOString().slice(0, 10),
      })
      .select();
    if (error) {
      console.error('[MyDeals] createDeal error:', error);
      alert(`Failed to create deal: ${error.message}`);
      return;
    }
    // If this deal was created from a pre-app, link it and archive the pre-app
    if (newDeal.preapp_id && insertedDeals && insertedDeals.length > 0) {
      const dealId = insertedDeals[0].id;
      const { error: linkErr } = await supabase
        .from('preapplications')
        .update({ deal_id: dealId, archived: true, status: 'Converted' })
        .eq('id', newDeal.preapp_id);
      if (linkErr) console.error('[MyDeals] preapp link error:', linkErr);
    }
    setNewDeal({ client_name: '', state: '', phone: '', ap: '', is_ny: false, status: 'Submitted', preapp_id: null });
    setShowNewDeal(false);
    loadDeals();
  };

  // Load pre-apps that aren't linked to any deal and aren't archived
  const openPreappPicker = async () => {
    setPreappSearch('');
    let query = supabase
      .from('preapplications')
      .select('*')
      .is('deal_id', null)
      .eq('archived', false)
      .order('created_at', { ascending: false });
    // Agents only see their own pre-apps
    if (agent.role !== 'admin' && agent.role !== 'admin_agent') {
      if (agent.agent_code) {
        query = query.or(`agent_id.eq.${agent.id},agent_code.eq.${agent.agent_code}`);
      } else {
        query = query.eq('agent_id', agent.id);
      }
    }
    const { data, error } = await query;
    if (error) {
      console.error('[MyDeals] loadPreapps error:', error);
      alert(`Failed to load pre-apps: ${error.message}`);
      return;
    }
    setAvailablePreapps(data || []);
    setShowPreappPicker(true);
  };

  const selectPreapp = (pa) => {
    const fd = pa.form_data || {};
    // Detect NY from state field
    const state = (fd.state || '').toUpperCase();
    const isNY = state === 'NY' || state === 'NEW YORK';
    // AP = monthly premium × 12
    let ap = '';
    if (pa.monthly_premium) {
      ap = String(Math.round(pa.monthly_premium * 12));
    }
    setNewDeal({
      client_name: pa.client_name || `${fd.first_name || ''} ${fd.last_name || ''}`.trim(),
      state: isNY ? 'NY' : (state.length === 2 ? state : ''),
      phone: pa.client_phone || fd.phone || '',
      ap,
      is_ny: isNY,
      status: 'Submitted',
      preapp_id: pa.id,
    });
    setShowPreappPicker(false);
    setShowNewDeal(true);
  };

  const filteredPreappOptions = useMemo(() => {
    if (!preappSearch.trim()) return availablePreapps;
    const q = preappSearch.trim().toLowerCase();
    return availablePreapps.filter((p) => {
      return (p.client_name || '').toLowerCase().includes(q)
        || (p.client_email || '').toLowerCase().includes(q)
        || (p.client_phone || '').toLowerCase().includes(q)
        || (p.plan || '').toLowerCase().includes(q);
    });
  }, [availablePreapps, preappSearch]);

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  const hasFilters = (filterStatus && filterStatus !== 'hide-declined') || filterMonth;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-navy text-lg">My Deals</h2>
        <div className="flex gap-2">
          <button
            onClick={openPreappPicker}
            className="px-4 py-2 bg-gold text-white text-sm font-semibold rounded-lg hover:opacity-90 flex items-center gap-2"
            title="Create a deal by linking an existing pre-application"
          >
            📋 From Pre-App
          </button>
          <button
            onClick={() => {
              if (showNewDeal) {
                setNewDeal({ client_name: '', state: '', phone: '', ap: '', is_ny: false, status: 'Submitted', preapp_id: null });
              }
              setShowNewDeal(!showNewDeal);
            }}
            className="px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span> New Deal
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase">Status</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-emerald-400">
            <option value="hide-declined">All (excl. Declined)</option>
            <option value="">All (incl. Declined)</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500 uppercase">Month</label>
          <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-emerald-400">
            <option value="">All</option>
            {monthOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        {hasFilters && (
          <button onClick={() => { setFilterStatus('hide-declined'); setFilterMonth(''); }}
            className="text-xs text-gray-500 hover:text-navy font-semibold underline">Clear filters</button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{filteredDeals.length} of {deals.length} deals</span>
      </div>

      {showNewDeal && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="font-bold text-navy mb-4">
            New Deal
            {newDeal.preapp_id && (
              <span className="ml-2 text-xs font-normal text-gold bg-orange-50 px-2 py-1 rounded">
                🔗 Linked to pre-app — will auto-archive on save
              </span>
            )}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input placeholder="Client Name *" value={newDeal.client_name}
              onChange={(e) => setNewDeal({ ...newDeal, client_name: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400" />
            <select value={newDeal.state} onChange={(e) => setNewDeal({ ...newDeal, state: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-emerald-400">
              <option value="">Select State...</option>
              {US_STATES.map((s) => <option key={s.abbr} value={s.abbr}>{s.name} - {s.abbr}</option>)}
            </select>
            <input placeholder="Phone" value={newDeal.phone}
              onChange={(e) => setNewDeal({ ...newDeal, phone: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400" />
            <input placeholder="Annualized Premium (AP) *" type="number" value={newDeal.ap}
              onChange={(e) => setNewDeal({ ...newDeal, ap: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400" />
            <select value={newDeal.status} onChange={(e) => setNewDeal({ ...newDeal, status: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400 bg-white">
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={newDeal.is_ny}
                onChange={(e) => setNewDeal({ ...newDeal, is_ny: e.target.checked })}
                className="w-4 h-4 rounded accent-emerald-500" />
              New York case
            </label>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={createDeal} className="px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600">Save Deal</button>
            <button onClick={() => setShowNewDeal(false)} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-200">Cancel</button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">#</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Client</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">St</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Phone</th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">AP</th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Commission</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Submitted</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Issued Paid</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-center py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Notes</th>
                <th className="text-center py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.length === 0 && (
                <tr><td colSpan={11} className="py-12 text-center text-gray-400 italic">
                  {hasFilters ? 'No deals match the selected filters' : 'No deals yet'}
                </td></tr>
              )}
              {filteredDeals.map((d, i) => {
                const isEditing = editingDeal === d.id;
                const comm = calcCommission(
                  isEditing ? parseInt(editForm.ap) || 0 : d.ap,
                  Number(agent.comp_rate),
                  isEditing ? editForm.is_ny : d.is_ny
                );
                const open = expandedDeal === d.id;
                const dealNotes = notes[d.id] || [];

                return (
                  <React.Fragment key={d.id}>
                    <tr className={`border-b border-gray-100 hover:bg-gray-50/80 transition-colors ${open ? 'bg-blue-50/50' : ''} ${isEditing ? 'bg-amber-50/50' : ''}`}>
                      <td className="py-3 px-3 text-gray-400 font-medium">{i + 1}</td>

                      {/* Client */}
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <input value={editForm.client_name} onChange={(e) => setEditForm({ ...editForm, client_name: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-semibold text-navy focus:outline-none focus:border-emerald-400" />
                        ) : (
                          <span className="font-semibold text-navy">{d.client_name}</span>
                        )}
                      </td>

                      {/* State */}
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <select value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                            className="w-24 border border-gray-300 rounded px-1 py-1 text-sm text-gray-500 bg-white focus:outline-none focus:border-emerald-400">
                            <option value="">--</option>
                            {US_STATES.map((s) => <option key={s.abbr} value={s.abbr}>{s.name} - {s.abbr}</option>)}
                          </select>
                        ) : (
                          <span className="text-gray-500">{d.state}</span>
                        )}
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                            className="w-32 border border-gray-300 rounded px-2 py-1 text-sm text-gray-500 focus:outline-none focus:border-emerald-400" />
                        ) : (
                          <span className="text-gray-500">{d.phone}</span>
                        )}
                      </td>

                      {/* AP */}
                      <td className="py-3 px-3 text-right">
                        {isEditing ? (
                          <input type="number" value={editForm.ap} onChange={(e) => setEditForm({ ...editForm, ap: e.target.value })}
                            className="w-20 text-right border border-gray-300 rounded px-2 py-1 text-sm font-bold text-navy focus:outline-none focus:border-emerald-400" />
                        ) : (
                          <span className="font-bold text-navy">{fmt(d.ap)}</span>
                        )}
                      </td>

                      {/* Commission */}
                      <td className="py-3 px-3 text-right font-semibold text-emerald-600">{fmt(comm)}</td>

                      {/* Date Submitted */}
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <input type="date" value={editForm.date_submitted}
                            onChange={(e) => setEditForm({ ...editForm, date_submitted: e.target.value })}
                            className="w-36 border border-gray-300 rounded px-2 py-1 text-sm text-gray-500 focus:outline-none focus:border-emerald-400" />
                        ) : (
                          <span className="text-gray-500">{d.date_submitted}</span>
                        )}
                      </td>

                      {/* Issued Paid Date */}
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <input type="date" value={editForm.date_issued_paid}
                            onChange={(e) => setEditForm({ ...editForm, date_issued_paid: e.target.value })}
                            className="w-36 border border-gray-300 rounded px-2 py-1 text-sm text-gray-500 focus:outline-none focus:border-emerald-400" />
                        ) : (
                          <span className="text-gray-500">{d.date_issued_paid || '—'}</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                            className={`text-xs font-semibold border rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-400 ${STATUS_SELECT_STYLES[editForm.status] || 'bg-white border-gray-300'}`}>
                            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <select value={d.status} onChange={(e) => updateStatus(d.id, e.target.value)}
                            className={`text-xs font-semibold border rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-400 ${STATUS_SELECT_STYLES[d.status] || 'bg-white border-gray-200'}`}>
                            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="py-3 px-3 text-center">
                        <button onClick={() => toggleExpand(d.id)}
                          className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${open ? 'bg-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {dealNotes.length || '0'}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => saveEdit(d.id)} title="Save"
                              className="w-7 h-7 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600">&#10003;</button>
                            <button onClick={cancelEdit} title="Cancel"
                              className="w-7 h-7 rounded-lg bg-gray-200 text-gray-600 text-xs font-bold hover:bg-gray-300">&#10005;</button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => startEdit(d)} title="Edit"
                              className="w-7 h-7 rounded-lg bg-gray-100 text-gray-500 text-xs hover:bg-blue-100 hover:text-blue-600">&#9998;</button>
                            <button onClick={() => deleteDeal(d.id)} title="Delete"
                              className="w-7 h-7 rounded-lg bg-gray-100 text-gray-400 text-xs hover:bg-red-100 hover:text-red-600">&#128465;</button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* NY checkbox when editing */}
                    {isEditing && (
                      <tr>
                        <td colSpan={11} className="bg-amber-50/50 px-6 py-2 border-b border-gray-100">
                          <label className="flex items-center gap-2 text-xs text-gray-600">
                            <input type="checkbox" checked={editForm.is_ny}
                              onChange={(e) => setEditForm({ ...editForm, is_ny: e.target.checked })}
                              className="w-4 h-4 rounded accent-emerald-500" />
                            New York case (50% CAR, 100% comp)
                          </label>
                        </td>
                      </tr>
                    )}

                    {/* Notes expansion */}
                    {open && !isEditing && (
                      <tr>
                        <td colSpan={11} className="bg-gray-50 px-6 py-4">
                          <div className="max-w-2xl">
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Notes & Comments</div>
                            {dealNotes.length > 0 ? (
                              <div className="space-y-2 mb-3">
                                {dealNotes.map((n) => (
                                  <div key={n.id} className="bg-white rounded-lg p-3 border border-gray-200 text-sm">
                                    <span className="text-gray-800">{n.content}</span>
                                    <div className="text-xs text-gray-400 mt-1">
                                      {n.author?.name || 'Unknown'} &middot; {new Date(n.created_at).toLocaleDateString()}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-gray-400 text-sm mb-3 italic">No notes yet</p>
                            )}
                            <div className="flex gap-2">
                              <input value={newNote} onChange={(e) => setNewNote(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addNote(d.id)}
                                placeholder="Add a note..."
                                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-400" />
                              <button onClick={() => addNote(d.id)}
                                className="px-4 py-2 bg-navy text-white text-sm font-semibold rounded-lg hover:bg-[#2a3f6a]">Add</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50">
                <td colSpan={4} className="py-3 px-3 text-right font-bold text-gray-600">Totals</td>
                <td className="py-3 px-3 text-right font-bold text-navy text-lg">{fmt(totals.ap)}</td>
                <td className="py-3 px-3 text-right font-bold text-emerald-600 text-lg">{fmt(totals.comm)}</td>
                <td colSpan={5}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Pre-app picker modal */}
      {showPreappPicker && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowPreappPicker(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-navy text-lg">Select a Pre-Application</h3>
              <button
                onClick={() => setShowPreappPicker(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Only unarchived pre-apps not yet linked to a deal are shown. Selecting one pre-fills the New Deal form; saving the deal archives the pre-app and links them.
            </p>
            <input
              type="text"
              value={preappSearch}
              onChange={(e) => setPreappSearch(e.target.value)}
              placeholder="Search name, email, phone..."
              className="border rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-emerald-400"
              autoFocus
            />
            <div className="overflow-y-auto flex-1 space-y-2">
              {filteredPreappOptions.length === 0 ? (
                <p className="text-center text-gray-400 py-8">
                  {availablePreapps.length === 0 ? 'No available pre-apps' : 'No matches'}
                </p>
              ) : (
                filteredPreappOptions.map((pa) => (
                  <button
                    key={pa.id}
                    onClick={() => selectPreapp(pa)}
                    className="w-full text-left border rounded-lg p-3 hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-navy truncate">
                          {pa.client_name || 'Unknown Client'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {pa.client_phone} {pa.client_email && `• ${pa.client_email}`}
                        </p>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        {pa.monthly_premium && (
                          <p className="text-sm font-bold text-emerald-600">
                            {fmt(pa.monthly_premium * 12)}/yr
                          </p>
                        )}
                        {pa.plan && <p className="text-xs text-gray-400">{pa.plan}</p>}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
