import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AlertTracker, ALERT_COOLDOWN_MS } from '../app/utils/serverAlert.ts';
import { assessThresholds, type ThresholdReading } from '../app/utils/monitoringThresholds.ts';

const reading = (over: Partial<ThresholdReading> = {}): ThresholdReading => ({
  key: 'cpu',
  label: 'CPU',
  percent: 10,
  level: 'ok',
  message: 'CPU 10% dipakai',
  ...over
});

test('the first observation is a baseline, not a notification', () => {
  // Regression: opening the window on an already-critical server must not fire a
  // notification, otherwise every launch would scream at the user.
  const t = new AlertTracker(0);
  const events = t.update([reading({ level: 'critical', percent: 98 })]);
  assert.deepEqual(events, []);
});

test('a band change fires once, then stays quiet while unchanged', () => {
  // Regression: notifying on every poll would fire 30 times a minute.
  const t = new AlertTracker(0);
  t.update([reading({ level: 'ok' })]);
  assert.equal(t.update([reading({ level: 'high', percent: 90 })]).length, 1);
  assert.deepEqual(t.update([reading({ level: 'high', percent: 91 })]), []);
  assert.deepEqual(t.update([reading({ level: 'high', percent: 92 })]), []);
});

test('escalation and recovery are both reported', () => {
  const t = new AlertTracker(0);
  t.update([reading({ level: 'ok' })]);
  const up = t.update([reading({ level: 'critical', percent: 97 })]);
  assert.equal(up[0]?.kind, 'escalation');
  assert.equal(up[0]?.from, 'ok');
  assert.equal(up[0]?.to, 'critical');

  const down = t.update([reading({ level: 'ok' })]);
  assert.equal(down[0]?.kind, 'recovery');
  assert.equal(down[0]?.from, 'critical');
});

test('cooldown suppresses a flapping metric but keeps tracking state', () => {
  // A metric oscillating around a boundary must not spam, yet the next genuine
  // escalation must still be detected once the cooldown lapses.
  const t = new AlertTracker(1000);
  t.update([reading({ level: 'ok' })], 0);
  assert.equal(t.update([reading({ level: 'warn' })], 100).length, 1);
  assert.equal(t.update([reading({ level: 'ok' })], 200).length, 0, 'recovery inside cooldown');
  assert.equal(t.update([reading({ level: 'ok' })], 5000).length, 0, 'already back to ok');
  assert.equal(t.update([reading({ level: 'critical', percent: 99 })], 5100).length, 1);
});

test('each resource is tracked independently', () => {
  const t = new AlertTracker(0);
  t.update([
    reading({ key: 'cpu', level: 'ok' }),
    reading({ key: 'disk', label: 'Disk', level: 'ok' })
  ]);
  const events = t.update([
    reading({ key: 'cpu', level: 'ok' }),
    reading({ key: 'disk', label: 'Disk', level: 'critical', percent: 97 })
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.reading.key, 'disk');
  assert.match(events[0]?.title ?? '', /Disk kritis/);
});

test('forgetExcept drops resources that no longer exist', () => {
  const t = new AlertTracker(0);
  t.update([reading({ key: 'cpu', level: 'ok' }), reading({ key: 'swap', level: 'ok' })]);
  t.forgetExcept(['cpu']);
  // swap is unknown again, so it is treated as a fresh baseline, not a recovery.
  assert.deepEqual(t.update([reading({ key: 'swap', level: 'critical' })]), []);
});

test('a real escalation from live metrics produces a useful message', () => {
  const t = new AlertTracker(0);
  t.update(assessThresholds({ cpu_usage: 5, load_avg: '0.1,0.1,0.1', cpu_cores: 2 }));
  const events = t.update(
    assessThresholds({ cpu_usage: 98, load_avg: '0.1,0.1,0.1', cpu_cores: 2 })
  );
  const cpu = events.find((e) => e.reading.key === 'cpu');
  assert.ok(cpu, 'cpu should have escalated');
  assert.equal(cpu.kind, 'escalation');
  assert.match(cpu.body, /98% dipakai/);
  assert.equal(ALERT_COOLDOWN_MS, 90_000);
});
