import ProgressBar from './ProgressBar';
import StatusBadge from './StatusBadge';
import { fmt } from '../utils/commission';

export default function AgentColumn({ agent, deals }) {
  const ad = deals.filter((d) => d.agent_id === agent.id);
  const issuedAP = ad
    .filter((d) => d.status === 'Issued' || d.status === 'Issued Paid')
    .reduce((s, d) => s + d.ap, 0);
  const pipelineAP = ad
    .filter((d) => d.status === 'Submitted')
    .reduce((s, d) => s + d.ap, 0);
  const remaining = Math.max(agent.monthly_goal - issuedAP, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-navy px-4 py-3">
        <h3 className="font-bold text-gray-100 text-sm">{agent.name}</h3>
      </div>
      <div className="p-4 space-y-3">
        <ProgressBar current={issuedAP} goal={agent.monthly_goal} />
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-blue-50 rounded-lg p-2">
            <div className="text-xs text-gray-500">Pipeline</div>
            <div className="font-bold text-blue-700 text-sm">{fmt(pipelineAP)}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-xs text-gray-500">Remaining</div>
            <div className="font-bold text-gray-700 text-sm">{fmt(remaining)}</div>
          </div>
        </div>
        <div className="border-t pt-3">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Deals</div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {ad.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-2">
                <span className="font-medium text-gray-700 truncate mr-2">{d.client_name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-navy">{fmt(d.ap)}</span>
                  <StatusBadge status={d.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
