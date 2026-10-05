import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSystemdUnits,
  parseSystemdUnitFiles,
  enrichUnitsWithUnitFiles,
  parseSystemdTimers,
  parseSystemdSockets,
  parseCombinedSystemdOutput,
  safeUnitName,
  buildSystemdCommand
} from '../app/utils/systemdParser.ts';

test('correctly parses systemctl list-units output', () => {
  const raw = `
  cron.service                 loaded active running Regular background program processing daemon
  docker.service               loaded active running Docker Application Container Engine
  emergency.service            loaded inactive dead   Emergency Shell
● nginx.service                loaded failed failed  A high performance web server
* redis-server.service         loaded active running Advanced key-value store
`;
  const units = parseSystemdUnits(raw);
  assert.equal(units.length, 5);

  assert.equal(units[0]?.unit, 'cron.service');
  assert.equal(units[0]?.name, 'cron');
  assert.equal(units[0]?.load, 'loaded');
  assert.equal(units[0]?.active, 'active');
  assert.equal(units[0]?.sub, 'running');
  assert.equal(units[0]?.description, 'Regular background program processing daemon');

  assert.equal(units[3]?.unit, 'nginx.service');
  assert.equal(units[3]?.name, 'nginx');
  assert.equal(units[3]?.active, 'failed');
  assert.equal(units[3]?.sub, 'failed');

  assert.equal(units[4]?.unit, 'redis-server.service');
  assert.equal(units[4]?.active, 'active');
});

test('correctly parses systemctl list-unit-files output and enriches units', () => {
  const unitFilesRaw = `
cron.service                                enabled         enabled
docker.service                              enabled         enabled
nginx.service                               disabled        enabled
inactive-worker.service                     disabled        disabled
`;
  const unitFilesMap = parseSystemdUnitFiles(unitFilesRaw);
  assert.equal(unitFilesMap['cron.service'], 'enabled');
  assert.equal(unitFilesMap['nginx.service'], 'disabled');
  assert.equal(unitFilesMap['inactive-worker.service'], 'disabled');

  const loadedUnits = parseSystemdUnits(`
  cron.service                 loaded active running Regular background daemon
  nginx.service                loaded active running Nginx Web Server
`);

  const enriched = enrichUnitsWithUnitFiles(loadedUnits, unitFilesMap);
  assert.equal(enriched.length, 4); // 2 loaded + 2 inactive unit-files
  assert.equal(enriched[0]?.enabled, 'enabled');
  assert.equal(enriched[1]?.enabled, 'disabled');
  assert.equal(enriched[2]?.unit, 'docker.service');
  assert.equal(enriched[3]?.unit, 'inactive-worker.service');
  assert.equal(enriched[3]?.active, 'inactive');
  assert.equal(enriched[3]?.enabled, 'disabled');
});

test('correctly parses systemctl list-timers output', () => {
  const raw = `
Mon 2026-10-05 16:00:00 UTC  1h 2min left  Mon 2026-10-05 14:00:00 UTC  57min ago  logrotate.timer  logrotate.service
n/a                          n/a           Mon 2026-10-05 12:00:00 UTC  2h 57min ago motd-news.timer motd-news.service
`;
  const timers = parseSystemdTimers(raw);
  assert.equal(timers.length, 2);

  assert.equal(timers[0]?.unit, 'logrotate.timer');
  assert.equal(timers[0]?.activates, 'logrotate.service');
  assert.ok(timers[0]?.next.includes('1h 2min left'));
  assert.ok(timers[0]?.last.includes('57min ago'));

  assert.equal(timers[1]?.unit, 'motd-news.timer');
  assert.equal(timers[1]?.activates, 'motd-news.service');
  assert.equal(timers[1]?.next, 'n/a');
  assert.ok(timers[1]?.last.includes('2h 57min ago'));
});

test('correctly parses systemctl list-sockets output', () => {
  const raw = `
/run/docker.sock                docker.socket                   docker.service
[::]:22                         ssh.socket                      ssh.service
`;
  const sockets = parseSystemdSockets(raw);
  assert.equal(sockets.length, 2);

  assert.equal(sockets[0]?.listen, '/run/docker.sock');
  assert.equal(sockets[0]?.unit, 'docker.socket');
  assert.equal(sockets[0]?.activates, 'docker.service');

  assert.equal(sockets[1]?.listen, '[::]:22');
  assert.equal(sockets[1]?.unit, 'ssh.socket');
  assert.equal(sockets[1]?.activates, 'ssh.service');
});

test('sanitizes unit names preventing command injection', () => {
  assert.equal(safeUnitName('nginx.service'), 'nginx.service');
  assert.equal(safeUnitName('user@1000.service'), 'user@1000.service');
  assert.equal(safeUnitName('bad; rm -rf /; .service'), 'badrm-rf.service');
  assert.equal(safeUnitName('bad`id`.service'), 'badid.service');
  assert.equal(safeUnitName(''), '');
});

test('builds systemd commands with and without sudo', () => {
  assert.equal(buildSystemdCommand('systemctl status nginx'), 'systemctl status nginx');
  assert.equal(buildSystemdCommand('systemctl restart nginx', true), 'sudo systemctl restart nginx');
  assert.equal(
    buildSystemdCommand('systemctl restart nginx', true, 'secret123'),
    "echo 'secret123' | sudo -S systemctl restart nginx"
  );
});

test('correctly parses combined multi-section systemd output', () => {
  const combined = `
---UNITS---
  cron.service                 loaded active running Regular background daemon
● bad.service                  loaded failed failed  Bad Service
---UNITFILES---
cron.service                                enabled         enabled
bad.service                                 disabled        enabled
extra.service                               enabled         enabled
---TIMERS---
Mon 2026-10-05 16:00:00 UTC  1h left  Mon 2026-10-05 14:00:00 UTC  50min ago  logrotate.timer  logrotate.service
---SOCKETS---
/run/docker.sock                docker.socket                   docker.service
---END---
`;
  const data = parseCombinedSystemdOutput(combined);
  assert.equal(data.units.length, 3); // cron, bad, extra
  assert.equal(data.units[0]?.unit, 'cron.service');
  assert.equal(data.units[0]?.enabled, 'enabled');
  assert.equal(data.units[1]?.unit, 'bad.service');
  assert.equal(data.units[1]?.active, 'failed');
  assert.equal(data.units[2]?.unit, 'extra.service');
  assert.equal(data.units[2]?.active, 'inactive');

  assert.equal(data.timers.length, 1);
  assert.equal(data.timers[0]?.unit, 'logrotate.timer');

  assert.equal(data.sockets.length, 1);
  assert.equal(data.sockets[0]?.unit, 'docker.socket');
});

