import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import DonutChart from './DonutChart';
import ProgressBar from './ProgressBar';
import PoliciesNeeded from './PoliciesNeeded';
import { fmt, calcCommissionWithHistory, COMMISSION_TIERS } from '../utils/commission';

/**
 * Get all descendant IDs of an agent (recursive downline).
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

export default function MyDashboard() {
  const { supabase, agent } = useAuth();
  const [deals, setDeals] = useState([]);
  const [allDeals, setAllDeals] = useState([]);
  const [allAgents, setAllAgents] = useState([]);
  const [compRateChanges, setCompRateChanges] = useState([]);
  const [goalMonth, setGoalMonth] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [myDealsRes, allDealsRes, agentsRes, settingsRes, changesRes] = await Promise.all([
        supabase.from('deals').select('*').eq('agent_id', agent.id),
        supabase.from('deals').select('*'),
        supabase.from('agents').select('*'),
        supabase.from('team_settings').select('goal_month').single(),
        supabase.from('comp_rate_changes').select('*').eq('agent_id', agent.id),
      ]);
      if (myDealsRes.data) setDeals(myDealsRes.data);
      if (allDealsRes.data) setAllDeals(allDealsRes.data);
      if (agentsRes.data) setAllAgents(agentsRes.data);
      if (changesRes.data) setCompRateChanges(changesRes.data);
      if (settingsRes.data) setGoalMonth(settingsRes.data.goal_month || '');
      setLoading(false);
    }
    load();
  }, [supabase, agent.id]);

  // Filter deals to goal month
  const monthDeals = useMemo(() => {
    return goalMonth
      ? deals.filter((d) => d.date_submitted && d.date_submitted.startsWith(goalMonth))
      : deals;
  }, [deals, goalMonth]);

  const issuedAP = monthDeals
    .filter((d) => d.status === 'Issued' || d.status === 'Issued Paid')
    .reduce((s, d) => s + d.ap, 0);
  const pipelineAP = monthDeals
    .filter((d) => d.status === 'Submitted')
    .reduce((s, d) => s + d.ap, 0);
  const pipelineCount = monthDeals.filter((d) => d.status === 'Submitted').length;
  const remaining = Math.max(agent.monthly_goal - issuedAP, 0);
  const commIssued = monthDeals
    .filter((d) => d.status === 'Issued' || d.status === 'Issued Paid')
    .reduce((s, d) => s + calcCommissionWithHistory(d.ap, agent, d.is_ny, d.date_submitted, compRateChanges), 0);

  // Commission Tier Progress
  // 2-month window: current month + previous month
  const tierProgress = useMemo(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    // Get all descendant IDs
    const descendantIds = getAllDescendantIds(agent.id, allAgents);

    // Personal + downline Issued Paid AP in the 2-month window
    const eligibleDeals = allDeals.filter((d) => {
      if (d.status !== 'Issued Paid') return false;
      const agentMatch = d.agent_id === agent.id || descendantIds.has(d.agent_id);
      if (!agentMatch) return false;
      if (!d.date_submitted) return false;
      const dealMonth = d.date_submitted.slice(0, 7);
      return dealMonth === currentMonth || dealMonth === prevMonth;
    });

    const totalProduction = eligibleDeals.reduce((sum, d) => sum + d.ap, 0);

    // Find current tier and next tiers
    const currentRate = Number(agent.comp_rate);
    const currentTierIdx = COMMISSION_TIERS.findIndex((t) => t.rate === currentRate);
    const effectiveTierIdx = currentTierIdx >= 0 ? currentTierIdx : 0;

    // Show next 5 tiers from current
    const upcomingTiers = [];
    for (let i = effectiveTierIdx; i < Math.min(effectiveTierIdx + 6, COMMISSION_TIERS.length); i++) {
      const tier = COMMISSION_TIERS[i];
      const reached = totalProduction >= tier.requirement;
      upcomingTiers.push({ ...tier, reached });
    }

    return { totalProduction, currentMonth, prevMonth, upcomingTiers, currentRate };
  }, [allDeals, allAgents, agent]);

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  function formatMonth(ym) {
    const [y, m] = ym.split('-');
    const d = new Date(Number(y), Number(m) - 1);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">My Monthly Goal</div>
          <DonutChart current={issuedAP} goal={agent.monthly_goal} />
          <div className="text-lg font-bold text-navy mt-2">{fmt(agent.monthly_goal)}</div>
        </div>
        <div className="md:col-span-2 bg-white border border-gray-200 rounded-xl p-6 flex flex-col justify-center">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">AP Issued vs Remaining</div>
          <ProgressBar current={issuedAP} goal={agent.monthly_goal} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">AP in Progress</div>
          <div className="text-3xl font-bold text-blue-600 mb-1">{fmt(pipelineAP)}</div>
          <div className="text-sm text-gray-500">{pipelineCount} policies submitted</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Policies Needed</div>
          <PoliciesNeeded apRemaining={remaining} />
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">My Commission (Issued)</div>
          <div className="text-3xl font-bold text-emerald-600">{fmt(commIssued)}</div>
        </div>
      </div>

      {/* Commission Tier Progress */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Commission Tier Progress</div>
            <div className="text-sm text-gray-400 mt-1">
              Based on personal + downline Issued Paid AP ({formatMonth(tierProgress.prevMonth)} &ndash; {formatMonth(tierProgress.currentMonth)})
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold text-gray-500 uppercase">2-Month Production</div>
            <div className="text-2xl font-bold text-navy">{fmt(tierProgress.totalProduction)}</div>
          </div>
        </div>

        <div className="space-y-2">
          {tierProgress.upcomingTiers.map((tier, i) => {
            const isCurrent = tier.rate === tierProgress.currentRate;
            const progress = tier.requirement > 0
              ? Math.min((tierProgress.totalProduction / tier.requirement) * 100, 100)
              : 100;
            const remaining = Math.max(tier.requirement - tierProgress.totalProduction, 0);

            return (
              <div key={tier.rate}
                className={`rounded-lg border p-3 ${
                  isCurrent
                    ? 'border-emerald-300 bg-emerald-50'
                    : tier.reached
                    ? 'border-green-200 bg-green-50/50'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${isCurrent ? 'text-emerald-700' : tier.reached ? 'text-green-600' : 'text-navy'}`}>
                      {tier.label}
                    </span>
                    {isCurrent && (
                      <span className="text-xs bg-emerald-500 text-white px-2 py-0.5 rounded-full font-bold">Current</span>
                    )}
                    {tier.reached && !isCurrent && (
                      <span className="text-xs text-green-600 font-semibold">Unlocked</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    {tier.requirement === 0
                      ? 'Starting tier'
                      : tier.reached
                      ? `${fmt(tier.requirement)} reached`
                      : `${fmt(remaining)} to go`
                    }
                  </div>
                </div>
                {tier.requirement > 0 && (
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        tier.reached ? 'bg-green-500' : isCurrent ? 'bg-emerald-500' : 'bg-blue-400'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
