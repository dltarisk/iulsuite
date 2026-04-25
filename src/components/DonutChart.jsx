export default function DonutChart({ current, goal, label }) {
  const pct = goal > 0 ? Math.min(current / goal, 1) : 0;
  const r = 70, cx = 90, cy = 90, stroke = 14;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const color = pct >= 1 ? '#059669' : pct >= 0.6 ? '#d4a853' : '#ef4444';

  return (
    <div className="flex flex-col items-center">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 1s ease' }} />
        <text x={cx} y={cy - 8} textAnchor="middle" fill="#1b2a4a" fontSize="26" fontWeight="800">
          {(pct * 100).toFixed(0)}%
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#9ca3af" fontSize="11" fontWeight="500">of goal</text>
      </svg>
      {label && <div className="text-xs text-gray-500 mt-1 font-medium">{label}</div>}
    </div>
  );
}
