export const WAIT_TIME_OPTIONS = [
  { value: 'fast',    label: 'Fast food' },
  { value: '5-15',    label: '5-15 minutes' },
  { value: '15-30',   label: '15-30 minutes' },
  { value: '30+',     label: '30+ minutes' },
];

export const PRICE_TIER_LABELS = ['', '$', '$$', '$$$', '$$$$'];

export const DISTANCE_BUCKETS = [
  { value: 'any',   label: 'Any distance' },
  { value: 'close', label: 'Close (<5 min)' },
  { value: 'medium', label: 'Medium (5-15 min)' },
  { value: 'long',  label: 'Long (15+ min)' },
];

export const SORT_OPTIONS = [
  { value: 'name',         label: 'Name' },
  { value: 'distance',     label: 'Distance' },
  { value: 'wait_time',    label: 'Wait time' },
  { value: 'stars',        label: 'Most stars' },
  { value: 'last_visited', label: 'Last visited' },
  { value: 'total_visits', label: 'Total visits' },
  { value: 'shuffle',      label: 'Shuffle' },
];

export const VISITED_FILTER_OPTIONS = [
  { value: 'any',   label: 'Any' },
  { value: 'never', label: 'Never visited' },
  { value: 'old',   label: 'Not in 90 days' },
];

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = String(dateStr).split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDateFull(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = String(dateStr).split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export function waitTimeLabel(val) {
  const opt = WAIT_TIME_OPTIONS.find(o => o.value === val);
  return opt ? opt.label : val || '—';
}

export function waitTimeMinutes(val) {
  switch (val) {
    case 'fast':  return 5;
    case '5-15':  return 10;
    case '15-30': return 22;
    case '30+':   return 40;
    default:      return 0;
  }
}
