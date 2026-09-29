import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseServerMetricsFull } from '../app/utils/monitoringParser.ts';

test('parseServerMetricsFull correctly parses valid full metrics output', () => {
  const rawOutput = `
---CPU---
14.5
---RAM---
1024 4096
256 2048
---DISK---
12G 50G 24%
---UPTIME---
up 3 days, 4 hours
---LOAD---
0.42, 0.35, 0.20
---TOPPROC---
1234 root 25.4 3.2 node
5678 www-data 12.1 1.5 nginx
`;

  const m = parseServerMetricsFull(rawOutput);
  assert.equal(m.cpu_usage, 14.5);
  assert.equal(m.ram_used_mb, 1024);
  assert.equal(m.ram_total_mb, 4096);
  assert.equal(m.ram_percent, 25);
  assert.equal(m.swap_used_mb, 256);
  assert.equal(m.swap_total_mb, 2048);
  assert.equal(m.swap_percent, 12.5);
  assert.equal(m.disk_used, '12G');
  assert.equal(m.disk_total, '50G');
  assert.equal(m.disk_percent, 24);
  assert.equal(m.uptime, 'up 3 days, 4 hours');
  assert.equal(m.load_avg, '0.42, 0.35, 0.20');
  assert.equal(m.top_processes.length, 2);
  assert.equal(m.top_processes[0]?.pid, '1234');
  assert.equal(m.top_processes[0]?.user, 'root');
  assert.equal(m.top_processes[0]?.cpu, 25.4);
  assert.equal(m.top_processes[0]?.command, 'node');
});

test('parseServerMetricsFull handles empty or partial input gracefully', () => {
  const emptyRes = parseServerMetricsFull('');
  assert.equal(emptyRes.cpu_usage, 0);
  assert.equal(emptyRes.ram_used_mb, 0);
  assert.equal(emptyRes.top_processes.length, 0);
  assert.equal(emptyRes.cpu_cores, 1);
});

test('parseServerMetricsFull reads cpu core count for load average scaling', () => {
  const cores = parseServerMetricsFull('---CORES---\n8\n');
  assert.equal(cores.cpu_cores, 8);

  // nproc missing on some minimal images: fall back to 1 rather than 0.
  const bogus = parseServerMetricsFull('---CORES---\nnotanumber\n');
  assert.equal(bogus.cpu_cores, 1);

  const zero = parseServerMetricsFull('---CORES---\n0\n');
  assert.equal(zero.cpu_cores, 1);
});
