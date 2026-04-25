export default function PoliciesNeeded({ apRemaining }) {
  const tiers = [
    { ap: 1800, label: '$1,800' },
    { ap: 2400, label: '$2,400' },
    { ap: 3600, label: '$3,600' },
  ];

  if (apRemaining <= 0) {
    return <div className="text-emerald-600 font-bold text-lg p-4">Goal reached!</div>;
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {tiers.map((t) => (
        <div key={t.ap} className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
          <div className="text-3xl font-bold text-navy">{Math.ceil(apRemaining / t.ap)}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium">at {t.label} AP</div>
        </div>
      ))}
    </div>
  );
}
