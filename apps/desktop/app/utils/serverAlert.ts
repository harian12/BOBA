/**
 * Escalation tracking for Server Monitoring alerts.
 *
 * A naive "notify whenever CPU > 90" fires every polling interval and trains the
 * user to ignore notifications. This only fires on a *transition* — crossing
 * into a worse band, or recovering back out of one — with a per-resource
 * cooldown so a metric oscillating around a boundary cannot spam.
 */
// `.ts` extension: this module is imported directly by the Node test runner,
// which resolves real paths and cannot follow a bundler-style extensionless import.
import { THRESHOLD_ORDER, type ThresholdLevel, type ThresholdReading } from './monitoringThresholds.ts';

export const ALERT_COOLDOWN_MS = 90 * 1000;

export type AlertKind = 'escalation' | 'recovery';

export interface AlertEvent {
  kind: AlertKind;
  reading: ThresholdReading;
  from: ThresholdLevel;
  to: ThresholdLevel;
  title: string;
  body: string;
}

const LEVEL_WORD: Record<ThresholdLevel, string> = {
  ok: 'normal',
  warn: 'perlu perhatian',
  high: 'tinggi',
  critical: 'kritis',
};

/**
 * Tracks the last band seen per resource and the time it changed, so repeated
 * polls in the same band produce nothing.
 */
export class AlertTracker {
  private last: Map<string, ThresholdLevel> = new Map();
  private lastNotifiedAt: Map<string, number> = new Map();
  private readonly cooldownMs: number;

  // Written out rather than as a TS parameter property: the test runner strips
  // types instead of compiling, and parameter properties are not supported there.
  constructor(cooldownMs: number = ALERT_COOLDOWN_MS) {
    this.cooldownMs = cooldownMs;
  }

  /** Seed from restored history so a resource already critical does not re-fire. */
  seed(key: string, level: ThresholdLevel): void {
    this.last.set(key, level);
  }

  reset(): void {
    this.last.clear();
    this.lastNotifiedAt.clear();
  }

  forgetExcept(keys: string[]): void {
    const keep = new Set(keys);
    for (const key of [...this.last.keys()]) {
      if (!keep.has(key)) this.last.delete(key);
    }
    for (const key of [...this.lastNotifiedAt.keys()]) {
      if (!keep.has(key)) this.lastNotifiedAt.delete(key);
    }
  }

  /**
   * Feed one poll's worth of readings and get back the transitions worth telling
   * the user about. The tracker state advances even when the cooldown suppresses
   * a notification, so the next real escalation is still detected.
   */
  update(readings: ThresholdReading[], now: number = Date.now()): AlertEvent[] {
    const events: AlertEvent[] = [];

    for (const reading of readings) {
      const previous = this.last.get(reading.key);
      this.last.set(reading.key, reading.level);

      // First observation establishes a baseline; it is not a transition.
      if (previous === undefined) continue;
      if (previous === reading.level) continue;

      const worse = THRESHOLD_ORDER[reading.level] > THRESHOLD_ORDER[previous];
      const kind: AlertKind = worse ? 'escalation' : 'recovery';

      const lastAt = this.lastNotifiedAt.get(reading.key);
      if (lastAt !== undefined && now - lastAt < this.cooldownMs) continue;
      this.lastNotifiedAt.set(reading.key, now);

      const host = reading.label;
      events.push({
        kind,
        reading,
        from: previous,
        to: reading.level,
        title: worse ? `${host} ${LEVEL_WORD[reading.level]}` : `${host} kembali ${LEVEL_WORD[reading.level]}`,
        body: worse
          ? `${reading.message} —previously ${LEVEL_WORD[previous]}.`
          : `${reading.message} — sudah turun dari ${LEVEL_WORD[previous]}.`,
      });
    }

    return events;
  }
}

/** Compact one-line summary for the in-window alert log. */
export function summariseEvents(events: AlertEvent[]): string {
  if (!events.length) return '';
  return events.map((e) => `${e.title} (${e.body})`).join('\n');
}
