import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessThresholds,
  breachedThresholds,
  worstLevel,
  THRESHOLD_RULES
} from '../app/utils/monitoringThresholds.ts';

const level = (metrics: Parameters<typeof assessThresholds>[0], key: string) =>
  assessThresholds(metrics).find((r) => r.key === key)?.level;

test('a healthy server reports every resource as ok', () => {
  const readings = assessThresholds({
    cpu_usage: 12,
    ram_percent: 40,
    swap_percent: 0,
    disk_percent: 30,
    load_avg: '0.20, 0.25, 0.30',
    cpu_cores: 4
  });
  assert.equal(readings.length, 5);
  assert.ok(readings.every((r) => r.level === 'ok'), 'expected all ok');
  assert.equal(worstLevel(readings), 'ok');
  assert.deepEqual(breachedThresholds(readings), []);
});

test('each resource escalates at its own documented band', () => {
  const base = { ram_percent: 10, swap_percent: 0, disk_percent: 10, load_avg: '0.1,0.1,0.1', cpu_cores: 8 };

  assert.equal(level({ ...base, cpu_usage: THRESHOLD_RULES.cpu.warn - 1 }, 'cpu'), 'ok');
  assert.equal(level({ ...base, cpu_usage: THRESHOLD_RULES.cpu.warn }, 'cpu'), 'warn');
  assert.equal(level({ ...base, cpu_usage: THRESHOLD_RULES.cpu.high }, 'cpu'), 'high');
  assert.equal(level({ ...base, cpu_usage: THRESHOLD_RULES.cpu.critical }, 'cpu'), 'critical');

  assert.equal(level({ ...base, ram_percent: THRESHOLD_RULES.ram.warn }, 'ram'), 'warn');
  assert.equal(level({ ...base, disk_percent: THRESHOLD_RULES.disk.warn }, 'disk'), 'warn');

  // Swap is judged far earlier: any sustained swapping means memory pressure.
  assert.equal(level({ ...base, swap_percent: THRESHOLD_RULES.swap.warn }, 'swap'), 'warn');
  assert.equal(level({ ...base, swap_percent: 10 }, 'swap'), 'ok');
});

test('load is normalised against core count', () => {
  // Regression: treating load as a raw number flags every 16-core box as busy.
  assert.equal(level({ load_avg: '8.00,8.00,8.00', cpu_cores: 16 }, 'load'), 'ok');
  assert.equal(level({ load_avg: '8.00,8.00,8.00', cpu_cores: 1 }, 'load'), 'critical');
  // Ratio 1.0 exactly is "all cores busy" = high.
  assert.equal(level({ load_avg: '2.00,2.00,2.00', cpu_cores: 2 }, 'load'), 'high');
  // Missing or malformed load must not invent a reading.
  assert.equal(level({ load_avg: '', cpu_cores: 4 }, 'load'), 'ok');
  assert.equal(level({ load_avg: 'nonsense', cpu_cores: 4 }, 'load'), 'ok');
});

test('cores never divide by zero', () => {
  // A missing core count is treated as a single core, so load 1.0 is "saturated"
  // rather than an accidental division by zero producing NaN or Infinity.
  assert.equal(level({ load_avg: '1.00,1.00,1.00', cpu_cores: 0 }, 'load'), 'high');
  assert.equal(level({ load_avg: '1.00,1.00,1.00' }, 'load'), 'high');
});

test('missing metrics do not fabricate a reading', () => {
  assert.deepEqual(assessThresholds(null), []);
  assert.deepEqual(assessThresholds(undefined), []);
  const readings = assessThresholds({});
  assert.equal(readings.length, 5);
  assert.ok(readings.every((r) => r.level === 'ok' && r.percent === 0));
});

test('breaches are returned worst first so the banner leads with the danger', () => {
  const breached = breachedThresholds(
    assessThresholds({
      cpu_usage: 72,
      ram_percent: 96,
      swap_percent: 5,
      disk_percent: 81,
      load_avg: '0.2,0.2,0.2',
      cpu_cores: 4
    })
  );
  // ram 96 is critical; cpu 72 and disk 81 are both warn and keep a stable order.
  assert.deepEqual(breached.map((b) => b.key), ['ram', 'cpu', 'disk']);
  assert.equal(worstLevel(breached), 'critical');
});

test('load percent is reported relative to cores for display', () => {
  const load = assessThresholds({ load_avg: '1.00,1.00,1.00', cpu_cores: 4 }).find((r) => r.key === 'load');
  assert.equal(load?.percent, 25);
  assert.match(load?.message ?? '', /Load 1 pada 4 core/);
});
