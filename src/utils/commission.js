export const CAR = 0.75;
export const CAR_NY = 0.50;

export function calcCommission(ap, compRate, isNY) {
  if (isNY) return ap * CAR_NY * 1.0;
  return ap * CAR * compRate;
}

/**
 * Calculate commission using the effective comp rate at the time the deal was submitted.
 * Falls back to agent's current comp_rate if no rate changes exist.
 */
export function calcCommissionWithHistory(ap, agent, isNY, dateSubmitted, compRateChanges) {
  const effectiveRate = getEffectiveRate(agent, dateSubmitted, compRateChanges);
  if (isNY) return ap * CAR_NY * 1.0;
  return ap * CAR * effectiveRate;
}

/**
 * Get the effective comp rate for an agent at a given date.
 * Looks at comp_rate_changes for the most recent change on or before the date.
 */
export function getEffectiveRate(agent, dateStr, compRateChanges) {
  if (!compRateChanges || compRateChanges.length === 0) return Number(agent.comp_rate);

  const agentChanges = compRateChanges
    .filter((c) => c.agent_id === agent.id)
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date));

  if (agentChanges.length === 0) return Number(agent.comp_rate);

  // Find the most recent change on or before dateStr
  let rate = Number(agent.comp_rate);
  // Walk backwards: the current comp_rate is the latest. Changes tell us what it was before.
  // Actually, we store new_rate + effective_date. So we find the applicable rate.
  // Start with the rate before any changes (previous_rate of the earliest change)
  const firstChange = agentChanges[0];
  let effectiveRate = Number(firstChange.previous_rate);

  for (const change of agentChanges) {
    if (dateStr >= change.effective_date) {
      effectiveRate = Number(change.new_rate);
    } else {
      break;
    }
  }

  return effectiveRate;
}

export function calcOverride(ap, headRate, subRate, isNY) {
  if (isNY) return 0; // No overrides for NY policies
  return (headRate - subRate) * ap * CAR;
}

export function fmt(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(n);
}

// Commission tier structure: 2-month production (personal + downline Issued Paid AP)
export const COMMISSION_TIERS = [
  { rate: 0.40, requirement: 0,      label: '40%' },
  { rate: 0.45, requirement: 2500,   label: '45%' },
  { rate: 0.50, requirement: 7500,   label: '50%' },
  { rate: 0.55, requirement: 15000,  label: '55%' },
  { rate: 0.60, requirement: 25000,  label: '60%' },
  { rate: 0.65, requirement: 50000,  label: '65%' },
  { rate: 0.70, requirement: 75000,  label: '70%' },
  { rate: 0.75, requirement: 125000, label: '75%' },
  { rate: 0.80, requirement: 175000, label: '80%' },
  { rate: 0.85, requirement: 250000, label: '85%' },
  { rate: 0.90, requirement: 325000, label: '90%' },
  { rate: 0.95, requirement: 400000, label: '95%' },
  { rate: 1.00, requirement: 500000, label: '100%' },
];
