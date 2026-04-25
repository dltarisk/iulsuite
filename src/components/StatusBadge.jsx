const STATUS_COLORS = {
  Submitted: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  Issued: { bg: 'bg-green-100', text: 'text-green-800', dot: 'bg-green-600' },
  'Issued Paid': { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  Declined: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
};

export default function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.Submitted;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`}></span>{status}
    </span>
  );
}
