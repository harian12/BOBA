/**
 * Threshold assessment for the Server Monitoring dashboard.
 *
 * Kept as pure functions so the rules can be unit tested without mounting a
 * component or opening an SSH session.
 */

export type ThresholdLevel = 'ok' | 'warn' | 'high' | 'critical';

export interface ThresholdRule {
  /** Value at which the reading becomes `warn`. */
  warn: number;
  /** Value at which the reading becomes `high`. */
  high: number;
  /** Value at which the reading becomes `critical`. */
  critical: number;
}

export interface ThresholdReading {
  key: string;
  label: string;
  /** Normalised 0-100 so every reading is comparable. */
  percent: number;
  level: ThresholdLevel;
  /** Human readable explanation of why this level applies. */
  message: string;
}

export const THRESHOLD_ORDER: Record<ThresholdLevel, number> = {
  ok: 0,
  warn: 1,
  high: 2,
  critical: 3,
};

export const THRESHOLD_RULES = {
  cpu: { warn: 70, high: 85, critical: 95 },
  ram: { warn: 75, high: 88, critical: 95 },
  swap: { warn: 25, high: 50, critical: 80 },
  disk: { warn: 80, high: 90, critical: 95 },
  load: { warn: 0.7, high: 1, critical: 1.5 },
} satisfies Record<string, ThresholdRule>;

function levelFor(value: number, rule: ThresholdRule): ThresholdLevel {
  if (value >= rule.critical) return 'critical';
  if (value >= rule.high) return 'high';
  if (value >= rule.warn) return 'warn';
  return 'ok';
}

const LEVEL_TEXT: Record<ThresholdLevel, string> = {
  ok: 'Normal',
  warn: 'Perlu perhatian',
  high: 'Tinggi',
  critical: 'Kritis',
};

const LEVEL_HINT: Record<ThresholdLevel, string> = {
  ok: 'masih dalam batas aman',
  warn: 'mulai mendekati batas',
  high: 'sudah melewati batas wajar',
  critical: 'sudah di zona berbahaya',
};

/** Tailwind classes per level, shared by KPI cards, banners and tables. */
export const LEVEL_CLASS: Record<ThresholdLevel, { text: string; chip: string; border: string }> = {
  ok: {
    text: 'text-slate-300',
    chip: 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40',
    border: 'border-emerald-800/30',
  },
  warn: {
    text: 'text-amber-300',
    chip: 'bg-amber-950/70 text-amber-300 border border-amber-800/50',
    border: 'border-amber-800/50',
  },
  high: {
    text: 'text-orange-400',
    chip: 'bg-orange-950/70 text-orange-300 border border-orange-800/50',
    border: 'border-orange-800/50',
  },
  critical: {
    text: 'text-red-400',
    chip: 'bg-red-950/80 text-red-300 border border-red-800/60',
    border: 'border-red-700/60',
  },
};

export const LEVEL_ICON: Record<ThresholdLevel, string> = {
  ok: 'lucide:circle-check',
  warn: 'lucide:triangle-alert',
  high: 'lucide:triangle-alert',
  critical: 'lucide:octagon-alert',
};

export function describeLevel(level: ThresholdLevel): string {
  return `${LEVEL_TEXT[level]} — ${LEVEL_HINT[level]}`;
}

export function worstLevel(readings: Pick<ThresholdReading, 'level'>[]): ThresholdLevel {
  return readings.reduce<ThresholdLevel>(
    (worst, r) => (THRESHOLD_ORDER[r.level] > THRESHOLD_ORDER[worst] ? r.level : worst),
    'ok'
  );
}

export interface MetricsLike {
  cpu_usage?: number;
  ram_percent?: number;
  swap_percent?: number;
  disk_percent?: number;
  load_avg?: string;
  cpu_cores?: number;
}

/**
 * Build one reading per resource. `load_avg` is normalised against core count so
 * "load 2" means something: on a 2-core box it is saturated, on a 16-core box it
 * is idle.
 */
export function assessThresholds(metrics: MetricsLike | null | undefined): ThresholdReading[] {
  if (!metrics) return [];

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  const cores = Math.max(1, num(metrics.cpu_cores) || 1);
  const parts = String(metrics.load_avg ?? '')
    .split(',')
    .map((v) => parseFloat(v.trim()))
    .filter((v) => Number.isFinite(v));
  const load1 = parts.length ? parts[0]! : 0;
  const loadRatio = load1 / cores;

  const loadPercent = Math.round(loadRatio * 100);

  return [
    {
      key: 'cpu',
      label: 'CPU',
      percent: num(metrics.cpu_usage),
      level: levelFor(num(metrics.cpu_usage), THRESHOLD_RULES.cpu),
      message: `CPU ${num(metrics.cpu_usage)}% dipakai`,
    },
    {
      key: 'ram',
      label: 'RAM',
      percent: num(metrics.ram_percent),
      level: levelFor(num(metrics.ram_percent), THRESHOLD_RULES.ram),
      message: `RAM ${num(metrics.ram_percent)}% terpakai`,
    },
    {
      key: 'swap',
      label: 'Swap',
      percent: num(metrics.swap_percent),
      level: levelFor(num(metrics.swap_percent), THRESHOLD_RULES.swap),
      message: `Swap ${num(metrics.swap_percent)}% terpakai`,
    },
    {
      key: 'disk',
      label: 'Disk',
      percent: num(metrics.disk_percent),
      level: levelFor(num(metrics.disk_percent), THRESHOLD_RULES.disk),
      message: `Disk / ${num(metrics.disk_percent)}% terisi`,
    },
    {
      key: 'load',
      label: 'Load Average',
      percent: loadPercent,
      level: levelFor(loadRatio, THRESHOLD_RULES.load),
      message: `Load ${load1} pada ${cores} core`,
    },
  ];
}

/** Only the readings that are actually over a limit, worst first. */
export function breachedThresholds(readings: ThresholdReading[]): ThresholdReading[] {
  return readings
    .filter((r) => r.level !== 'ok')
    .sort((a, b) => THRESHOLD_ORDER[b.level] - THRESHOLD_ORDER[a.level]);
}
