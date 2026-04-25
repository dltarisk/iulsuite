import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import DonutChart from './DonutChart';
import ProgressBar from './ProgressBar';
import PoliciesNeeded from './PoliciesNeeded';
import AgentColumn from './AgentColumn';
import { fmt } from '../utils/commission';

// Helper: filter deals to a specific month (YYYY-MM)
function dealsInMonth(deals, month) {
  if (!month) return deals;
  return deals.filter((d) => d.date_submitted && d.date_submitted.startsWith(month));
}

// Format goal month for display
function formatMonth(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const d = new Date(Number(y), Number(m) - 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function TeamDashboard() {
  const { supabase } = useAuth();
  const [teamGoal, setTeamGoal] = useState(90000);
  const [goalMonth, setGoalMonth] = useState('');
  const [agents, setAgents] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [settingsRes, agentsRes, dealsRes] = await Promise.all([
        supabase.from('team_settings').select('monthly_goal, goal_month').single(),
        supabase.from('agents').select('*').eq('active', true).neq('role', 'admin'),
        supabase.from('deals').select('*'),
      ]);
      if (settingsRes.data) {
        setTeamGoal(settingsRes.data.monthly_goal);
        setGoalMonth(settingsRes.data.goal_month || '');
      }
      if (agentsRes.data) setAgents(agentsRes.data);
      if (dealsRes.data) setDeals(dealsRes.data);
      setLoading(false);
    }
    load();
  }, [supabase]);

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  const activeAgentIds = new Set(agents.map((a) => a.id));
  const monthDeals = dealsInMonth(deals, goalMonth);
  const activeDeals = monthDeals.filter((d) => activeAgentIds.has(d.agent_id));
  const teamIssuedAP = activeDeals
    .filter((d) => d.status === 'Issued' || d.status === 'Issued Paid')
    .reduce((s, d) => s + d.ap, 0);
  const teamPipelineAP = activeDeals
    .filter((d) => d.status === 'Submitted')
    .reduce((s, d) => s + d.ap, 0);
  const teamPipelineCount = activeDeals.filter((d) => d.status === 'Submitted').length;
  const teamRemaining = Math.max(teamGoal - teamIssuedAP, 0);

  return (
    <div className="space-y-6">
      {goalMonth && (
        <div className="text-sm text-gray-500 font-medium">
          Showing: <span className="text-navy font-bold">{formatMonth(goalMonth)}</span>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Monthly Goal</div>
          <DonutChart current={teamIssuedAP} goal={teamGoal} />
          <div className="text-lg font-bold text-navy mt-2">{fmt(teamGoal)}</div>
        </div>
        <div className="md:col-span-2 bg-white border border-gray-200 rounded-xl p-6 flex flex-col justify-center">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">AP Issued vs Remaining</div>
          <ProgressBar current={teamIssuedAP} goal={teamGoal} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">AP in Progress</div>
          <div className="text-3xl font-bold text-blue-600 mb-1">{fmt(teamPipelineAP)}</div>
          <div className="text-sm text-gray-500 mb-4">
            {teamPipelineCount} {teamPipelineCount === 1 ? 'policy' : 'policies'} submitted, awaiting decision
          </div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3 mt-2 pt-4 border-t">
            Policies Needed to Hit Goal
          </div>
          <PoliciesNeeded apRemaining={teamRemaining} />
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">If All Pipeline Converts</div>
          <div className="bg-blue-50 rounded-lg border border-blue-100 p-4 mb-4">
            <div className="text-sm text-gray-600">Remaining AP would drop to</div>
            <div className="text-2xl font-bold text-navy mt-1">{fmt(Math.max(teamRemaining - teamPipelineAP, 0))}</div>
          </div>
          <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Policies Still Needed After Pipeline</div>
          <PoliciesNeeded apRemaining={Math.max(teamRemaining - teamPipelineAP, 0)} />
        </div>
      </div>

      <div>
        <h2 className="font-bold text-navy text-lg mb-3">Agent Breakdown</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {agents.map((a) => (
            <AgentColumn key={a.id} agent={a} deals={monthDeals} />
          ))}
        </div>
      </div>
    </div>
  );
}
