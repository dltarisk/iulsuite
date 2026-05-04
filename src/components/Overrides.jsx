import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import StatusBadge from './StatusBadge';
import { fmt, calcOverride, getEffectiveRate, getEffectiveOverrideRate, CAR } from '../utils/commission';

/**
 * Get all descendant agent IDs for a given agent (recursive downline).
 * Returns a Map of descendantId -> { directChild, pathToAgent }
 * directChild = the root's direct report in the chain leading to this descendant.
 */
function getDownlineMap(rootId, allAgents) {
  const childrenOf = {};
  for (const a of allAgents) {
    if (a.recruiter_id) {
      if (!childrenOf[a.recruiter_id]) childrenOf[a.recruiter_id] = [];
      childrenOf[a.recruiter_id].push(a);
    }
  }

  const result = new Map();
  const directChildren = childrenOf[rootId] || [];

  for (const child of directChildren) {
    result.set(child.id, { directChild: child });
    const queue = [child];
    while (queue.length > 0) {
      const current = queue.shift();
      const grandchildren = childrenOf[current.id] || [];
      for (const gc of grandchildren) {
        result.set(gc.id, { directChild: child });
        queue.push(gc);
      }
    }
  }

  return result;
}

/**
 * Get all descendants of an agent (flat set of IDs).
 */
function getAllDescendantIds(agentId, allAgents) {
  const childrenOf = {};
  for (const a of allAgents) {
    if (a.recruiter_id) {
      if (!childrenOf[a.recruiter_id]) childrenOf[a.recruiter_id] = [];
      childrenOf[a.recruiter_id].push(a);
    }
  }
  const ids = new Set();
  const queue = [agentId];
  while (queue.length > 0) {
    const current = queue.shift();
    const children = childrenOf[current] || [];
    for (const c of children) {
      ids.add(c.id);
      queue.push(c.id);
    }
  }
  return ids;
}

/**
 * Walk up from dealAgentId to find the immediate child of headId in the chain.
 * Returns the agent object or null.
 */
function findImmediateChildInChain(dealAgentId, headId, agentsById) {
  let current = dealAgentId;
  let child = null;
  while (current && current !== headId) {
    child = current;
    const agent = agentsById.get(current);
    if (!agent) break;
    current = agent.recruiter_id;
  }
  if (current === headId) return agentsById.get(child);
  return null;
}

export default function Overrides() {
  const { supabase, agent } = useAuth();
  const [allAgents, setAllAgents] = useState([]);
  const [deals, setDeals] = useState([]);
  const [compRateChanges, setCompRateChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterAgent, setFilterAgent] = useState('');

  useEffect(() => {
    async function load() {
      const [agentsRes, dealsRes, changesRes] = await Promise.all([
        supabase.from('agents').select('*'),
        supabase.from('deals').select('*'),
        supabase.from('comp_rate_changes').select('*'),
      ]);
      if (agentsRes.data) setAllAgents(agentsRes.data);
      if (dealsRes.data) setDeals(dealsRes.data);
      if (changesRes.data) setCompRateChanges(changesRes.data);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const isAdmin = agent.role === 'admin';

  const headAgent = useMemo(() => {
    if (!allAgents.length) return agent;
    if (isAdmin) {
      const adminAgents = allAgents.filter((a) => a.role === 'admin_agent' && a.active);
      if (adminAgents.length > 0) {
        return adminAgents.reduce((best, a) =>
          Number(a.comp_rate) > Number(best.comp_rate) ? a : best
        , adminAgents[0]);
      }
    }
    return agent;
  }, [allAgents, agent, isAdmin]);

  const headId = headAgent.id;

  const agentsById = useMemo(() => {
    const map = new Map();
    for (const a of allAgents) map.set(a.id, a);
    return map;
  }, [allAgents]);

  // Build override rows
  const overrideRows = useMemo(() => {
    if (!allAgents.length) return [];

    const downline = getDownlineMap(headId, allAgents);
    const rows = [];

    for (const deal of deals) {
      const dealAgentId = deal.agent_id;
      if (!downline.has(dealAgentId)) continue;

      // No overrides for NY policies
      if (deal.is_ny) continue;

      const dealAgent = agentsById.get(dealAgentId);
      const { directChild } = downline.get(dealAgentId);

      // Get effective OVERRIDE rates at time of deal submission
      const dateStr = deal.date_submitted || '';
      const headRate = getEffectiveOverrideRate(headAgent, dateStr, compRateChanges);
      const directChildRate = getEffectiveOverrideRate(directChild, dateStr, compRateChanges);

      // Override = AP × CAR × (head override rate - direct child override rate)
      const overridePct = headRate - directChildRate;
      const override = deal.ap * CAR * overridePct;
      const isIssued = deal.status === 'Issued' || deal.status === 'Issued Paid';

      rows.push({ deal, dealAgent, directChild, override, overridePct, isIssued });
    }

    return rows;
  }, [allAgents, deals, headId, headAgent, agentsById, compRateChanges]);

  // Downline agents for filter
  const downlineAgents = useMemo(() => {
    if (!allAgents.length) return [];
    const downline = getDownlineMap(headId, allAgents);
    const agentIds = new Set(downline.keys());
    return allAgents.filter((a) => agentIds.has(a.id));
  }, [allAgents, headId]);

  // Month options
  const monthOptions = useMemo(() => {
    const months = new Set();
    for (const row of overrideRows) {
      const d = row.deal.date_submitted;
      if (d) months.add(d.slice(0, 7));
    }
    return [...months].sort().reverse();
  }, [overrideRows]);

  // Apply filters
  const filteredRows = useMemo(() => {
    let rows = overrideRows;
    if (filterMonth) {
      rows = rows.filter((r) => r.deal.date_submitted && r.deal.date_submitted.startsWith(filterMonth));
    }
    if (filterStatus) {
      rows = rows.filter((r) => r.deal.status === filterStatus);
    }
    if (filterAgent) {
      const descendantIds = getAllDescendantIds(filterAgent, allAgents);
      descendantIds.add(filterAgent);
      rows = rows.filter((r) => descendantIds.has(r.deal.agent_id));
    }
    return rows;
  }, [overrideRows, filterMonth, filterStatus, filterAgent, allAgents]);

  // Totals — sum ALL currently displayed rows (whatever filters are active)
  const { totalAP, totalOverrides } = useMemo(() => {
    let ap = 0, ovr = 0;
    for (const r of filteredRows) {
      ap += r.deal.ap;
      ovr += r.override;
    }
    return { totalAP: ap, totalOverrides: ovr };
  }, [filteredRows]);

  const hasFilters = filterMonth || filterStatus || filterAgent;

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  const headOverrideRate = getEffectiveOverrideRate(headAgent, new Date().toISOString().slice(0, 10), compRateChanges);

  function formatMonth(ym) {
    const [y, m] = ym.split('-');
    const d = new Date(Number(y), Number(m) - 1);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-navy text-lg">Override Income</h2>
        <div className="text-sm text-gray-500">
          {isAdmin ? `Viewing as ${headAgent.name}` : 'Your override rate'}:{' '}
          <span className="font-bold text-navy">{(headOverrideRate * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
          <option value="">All Months</option>
          {monthOptions.map((m) => <option key={m} value={m}>{formatMonth(m)}</option>)}
        </select>

        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
          <option value="">All Statuses</option>
          <option value="Submitted">Submitted</option>
          <option value="Issued">Issued</option>
          <option value="Issued Paid">Issued Paid</option>
          <option value="Declined">Declined</option>
        </select>

        <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
          <option value="">All Agents</option>
          {downlineAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        {hasFilters && (
          <button onClick={() => { setFilterMonth(''); setFilterStatus(''); setFilterAgent(''); }}
            className="text-xs text-red-500 hover:text-red-700 font-medium">
            Clear filters
          </button>
        )}

        <span className="text-xs text-gray-400 ml-auto">
          {filteredRows.length} of {overrideRows.length} deals
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">#</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Agent</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Via</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Client</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">St</th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">AP</th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Ovr %</th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Override</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Submitted</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 && (
                <tr><td colSpan={10} className="py-12 text-center text-gray-400 italic">No override deals</td></tr>
              )}
              {filteredRows.map((row, i) => {
                const { deal, dealAgent, directChild, override, overridePct } = row;
                const isDirect = dealAgent?.id === directChild.id;
                return (
                  <tr key={deal.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                    <td className="py-3 px-3 text-gray-400 font-medium">{i + 1}</td>
                    <td className="py-3 px-3 font-medium text-gray-700">{dealAgent?.name}</td>
                    <td className="py-3 px-3 text-gray-400 text-xs">{isDirect ? '—' : directChild.name}</td>
                    <td className="py-3 px-3 font-semibold text-navy">{deal.client_name}</td>
                    <td className="py-3 px-3 text-gray-500">{deal.state}</td>
                    <td className="py-3 px-3 text-right font-bold text-navy">{fmt(deal.ap)}</td>
                    <td className="py-3 px-3 text-right text-gray-500">{(overridePct * 100).toFixed(0)}%</td>
                    <td className="py-3 px-3 text-right font-semibold text-gold">{fmt(override)}</td>
                    <td className="py-3 px-3 text-gray-500">{deal.date_submitted}</td>
                    <td className="py-3 px-3"><StatusBadge status={deal.status} /></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50">
                <td colSpan={5} className="py-3 px-3 text-right font-bold text-gray-600">
                  Totals{filterStatus ? ` (${filterStatus})` : ''}
                </td>
                <td className="py-3 px-3 text-right font-bold text-navy">{fmt(totalAP)}</td>
                <td className="py-3 px-3"></td>
                <td className="py-3 px-3 text-right font-bold text-gold text-lg">{fmt(totalOverrides)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
