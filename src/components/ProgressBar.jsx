import { fmt } from '../utils/commission';

export default function ProgressBar({ current, goal }) {
  const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const color = pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-[#d4a853]' : 'bg-red-400';
  const remaining = Math.max(goal - current, 0);

  return (
    <div>
      <div className="flex justify-between text-sm font-bold text-navy mb-2">
        <span>Issued: {fmt(current)}</span>
        <span>Remaining: {fmt(remaining)}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-5 overflow-hidden relative">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }}></div>
        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ color: pct > 45 ? 'white' : '#1b2a4a' }}>
          {pct.toFixed(0)}%
        </div>
      </div>
    </div>
  );
}
