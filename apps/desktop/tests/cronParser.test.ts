import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCrontab,
  serializeCrontab,
  describeCronSchedule,
  isValidCronSchedule,
  buildCronSchedule
} from '../app/utils/cronParser.ts';

test('isValidCronSchedule', () => {
  assert.equal(isValidCronSchedule('* * * * *'), true);
  assert.equal(isValidCronSchedule('0 2 * * *'), true);
  assert.equal(isValidCronSchedule('*/5 1-3 1,15 * 0'), true);
  assert.equal(isValidCronSchedule('@daily'), true);
  assert.equal(isValidCronSchedule('@reboot'), true);
  
  assert.equal(isValidCronSchedule('invalid'), false);
  assert.equal(isValidCronSchedule('* * * *'), false); // 4 parts
  assert.equal(isValidCronSchedule('@unknown'), false);
});

test('describeCronSchedule', () => {
  assert.equal(describeCronSchedule('* * * * *'), 'Setiap menit');
  assert.equal(describeCronSchedule('*/5 * * * *'), 'Setiap 5 menit');
  assert.equal(describeCronSchedule('0 * * * *'), 'Setiap jam (menit ke-0)');
  assert.equal(describeCronSchedule('30 2 * * *'), 'Setiap hari pukul 02:30');
  assert.equal(describeCronSchedule('0 0 * * 0'), 'Setiap hari Minggu pukul 00:00');
  assert.equal(describeCronSchedule('0 0 1 * *'), 'Setiap tanggal 1 pukul 00:00');
  assert.equal(describeCronSchedule('@reboot'), 'Saat sistem dinyalakan (boot)');
  assert.equal(describeCronSchedule('@daily'), 'Setiap hari pukul 00:00');
  assert.equal(describeCronSchedule('15 14 1 * *'), 'Setiap tanggal 1 pukul 14:15');
});

test('buildCronSchedule', () => {
  assert.equal(buildCronSchedule('0', '2', '*', '*', '*'), '0 2 * * *');
});

test('parseCrontab - user standard', () => {
  const raw = `
# Ini komentar
0 2 * * * /backup.sh

# Komentar lain
@daily /cleanup.sh
`;
  const items = parseCrontab(raw, 'user');
  assert.equal(items.length, 2);
  
  assert.equal(items[0]!.schedule, '0 2 * * *');
  assert.equal(items[0]!.command, '/backup.sh');
  assert.equal(items[0]!.comment, 'Ini komentar');
  assert.equal(items[0]!.enabled, true);
  
  assert.equal(items[1]!.schedule, '@daily');
  assert.equal(items[1]!.command, '/cleanup.sh');
  assert.equal(items[1]!.comment, 'Komentar lain');
});

test('parseCrontab - disabled jobs', () => {
  const raw = `
# Ini job dimatikan
# 0 2 * * * /backup.sh
#@daily /cleanup.sh
`;
  const items = parseCrontab(raw, 'user');
  assert.equal(items.length, 2);
  
  assert.equal(items[0]!.schedule, '0 2 * * *');
  assert.equal(items[0]!.command, '/backup.sh');
  assert.equal(items[0]!.enabled, false);
  assert.equal(items[0]!.comment, 'Ini job dimatikan');
  
  assert.equal(items[1]!.schedule, '@daily');
  assert.equal(items[1]!.command, '/cleanup.sh');
  assert.equal(items[1]!.enabled, false);
});

test('parseCrontab - system format', () => {
  const raw = `
0 2 * * * root /backup.sh
`;
  // Untuk source='system', user string tetap jadi bagian command dalam parser ini
  const items = parseCrontab(raw, 'system');
  assert.equal(items.length, 1);
  assert.equal(items[0]!.command, 'root /backup.sh');
  assert.equal(items[0]!.schedule, '0 2 * * *');
});

test('serializeCrontab', () => {
  const items = parseCrontab('# komen\n0 2 * * * /backup.sh\n# 0 3 * * * /disabled.sh', 'user');
  const out = serializeCrontab(items);
  assert.match(out, /# komen/);
  assert.match(out, /0 2 \* \* \* \/backup.sh/);
  assert.match(out, /# 0 3 \* \* \* \/disabled.sh/);
});
