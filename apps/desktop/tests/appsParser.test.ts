import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRunningApps,
  parseSourceAvailability,
  detectPm2Format,
  buildLogCommand,
  buildLogCommandWithSudo,
  buildLogExistsCommand,
  resolvePm2LogPath,
  pm2LogPath
} from '../app/utils/appsParser.ts';

test('parses pm2, docker and systemd sections', () => {
  const raw = [
    '---PM2---',
    JSON.stringify([
      { name: 'api', pm2_env: { status: 'online', pm_exec_path: '/srv/api/server.js', pm_cwd: '/srv/api' } },
      { name: 'worker', pm2_env: { status: 'online', pm_exec_path: '/srv/worker/index.js', pm_cwd: '/srv/worker' } }
    ]),
    '---END---',
    '---DOCKER---',
    'web|nginx:alpine|Up 3 hours',
    'db|postgres:16|Up 3 hours',
    '---END---',
    '---SYSTEMD---',
    'nginx.service~active~running',
    'redis-server.service~active~running',
    '---END---'
  ].join('\n');

  const apps = parseRunningApps(raw);
  assert.equal(apps.length, 6);

  const pm2Apps = apps.filter((a) => a.kind === 'pm2');
  assert.equal(pm2Apps.length, 2);
  assert.equal(pm2Apps[0]?.name, 'api');
  assert.equal(pm2Apps[0]?.detail, '/srv/api/server.js');
  assert.equal(pm2Apps[0]?.status, 'online');

  const dockerApps = apps.filter((a) => a.kind === 'docker');
  assert.equal(dockerApps.length, 2);
  assert.equal(dockerApps[0]?.name, 'web');
  assert.equal(dockerApps[0]?.detail, 'nginx:alpine');

  const sysdApps = apps.filter((a) => a.kind === 'systemd');
  assert.equal(sysdApps.length, 2);
  assert.equal(sysdApps[0]?.name, 'nginx.service');
  assert.equal(sysdApps[0]?.status, 'active');
});

test('tolerates missing sources and malformed pm2 json', () => {
  // pm2 not installed: emits an empty array, docker missing entirely.
  const raw = ['---PM2---', '[]', '---END---', '---DOCKER---', '---END---', '---SYSTEMD---', 'sshd.service~active~running', '---END---'].join('\n');
  const apps = parseRunningApps(raw);
  assert.equal(apps.filter((a) => a.kind === 'pm2').length, 0);
  assert.equal(apps.filter((a) => a.kind === 'docker').length, 0);
  assert.equal(apps.filter((a) => a.kind === 'systemd').length, 1);

  // Broken JSON must not throw.
  const broken = ['---PM2---', '{not json', '---END---'].join('\n');
  assert.equal(parseRunningApps(broken).length, 0);

  assert.equal(parseRunningApps('').length, 0);
  assert.equal(parseRunningApps('total garbage with no markers').length, 0);
});

test('builds snapshot and follow commands per log source', () => {
  assert.equal(
    buildLogCommand({ kind: 'docker', name: 'web' }, 200, false),
    "docker logs --tail 200 'web'"
  );
  assert.equal(
    buildLogCommand({ kind: 'docker', name: 'web' }, 200, true),
    "docker logs --tail 200 -f 'web'"
  );
  assert.equal(
    buildLogCommand({ kind: 'systemd', name: 'nginx.service' }, 100, false),
    "journalctl -u 'nginx' -n 100 --no-pager -o short-iso"
  );
  assert.equal(
    buildLogCommand({ kind: 'file', name: '/var/log/nginx/error.log' }, 50, true),
    "tail -n 50 -f '/var/log/nginx/error.log'"
  );
});

test('quotes names so spaces and quotes cannot break out of the shell', () => {
  assert.equal(
    buildLogCommand({ kind: 'file', name: "/tmp/it's here.log" }, 10, false),
    "tail -n 10 '/tmp/it'\\''s here.log'"
  );
  // A name that tries to chain a second command stays a single argument.
  const injected = buildLogCommand({ kind: 'file', name: 'x.log; rm -rf /' }, 10, false);
  assert.equal(injected, "tail -n 10 'x.log; rm -rf /'");
});

test('wraps log commands in sudo consistently with the docker feature', () => {
  const target = { kind: 'docker', name: 'web' } as const;
  assert.equal(buildLogCommandWithSudo(target, 200, false, false), "docker logs --tail 200 'web'");
  assert.equal(buildLogCommandWithSudo(target, 200, false, true), "sudo docker logs --tail 200 'web'");
  assert.equal(
    buildLogCommandWithSudo(target, 200, false, true, "s3cr3t"),
    "echo 's3cr3t' | sudo -S docker logs --tail 200 'web'"
  );
});

test('pm2 log path helper points at the pm2 out log', () => {
  assert.equal(pm2LogPath('api'), '~/.pm2/logs/api-out.log');
  assert.equal(pm2LogPath('api', 'error'), '~/.pm2/logs/api-error.log');
});

test('uses the log path pm2 reported instead of guessing the filename', () => {
  // Regression: ecosystem.config.js can rename or relocate logs, so
  // ~/.pm2/logs/<name>-out.log is frequently the wrong file.
  const raw = [
    '---PM2---',
    '{"name":"LMS-Api","pm2_env":{"status":"online","pm_exec_path":"/home/an/LMS/run.sh",' +
      '"pm_out_log_path":"/var/log/app/lms.out","pm_err_log_path":"/var/log/app/lms.err"}}',
    '---END---'
  ].join('\n');

  const app = parseRunningApps(raw).find((a) => a.name === 'LMS-Api');
  assert.ok(app, 'app must be parsed');
  assert.equal(app?.outLog, '/var/log/app/lms.out');
  assert.equal(app?.errLog, '/var/log/app/lms.err');

  assert.equal(resolvePm2LogPath(app!, 'out'), '/var/log/app/lms.out');
  assert.equal(resolvePm2LogPath(app!, 'error'), '/var/log/app/lms.err');

  // Without a reported path we still fall back to the conventional location.
  assert.equal(resolvePm2LogPath({ name: 'plain' }, 'out'), '~/.pm2/logs/plain-out.log');
  assert.equal(resolvePm2LogPath({ name: 'plain' }, 'error'), '~/.pm2/logs/plain-error.log');
});

test('checks the log file exists before tailing it', () => {
  assert.equal(
    buildLogExistsCommand('/var/log/app/lms.out'),
    "test -f '/var/log/app/lms.out' && echo __BOBA_EXISTS__ || echo __BOBA_MISSING__"
  );
  // A `~` path must stay expandable inside the test command too: the tilde stays a
  // bare word and the remainder is one quoted argument.
  assert.equal(
    buildLogExistsCommand('~/.pm2/logs/api-out.log'),
    "test -f ~/'.pm2/logs/api-out.log' && echo __BOBA_EXISTS__ || echo __BOBA_MISSING__"
  );
  assert.ok(
    buildLogExistsCommand('~/.pm2/logs/api-out.log').startsWith('test -f ~/'),
    'tilde must not be quoted or the shell will not expand it'
  );
});

test('detects the pm2 output shape before parsing it', () => {
  const proc = '{"name":"api","pm2_env":{"status":"online"}}';

  // PM2 3/4: a single array, on one line or pretty-printed.
  assert.equal(detectPm2Format('[]'), 'array');
  assert.equal(detectPm2Format(`[${proc}]`), 'array');
  assert.equal(detectPm2Format(`[\n  ${proc}\n]`), 'array');

  // PM2 5+: JSON Lines.
  assert.equal(detectPm2Format(`${proc}\n${proc}`), 'jsonl');
  assert.equal(detectPm2Format(proc), 'single');

  assert.equal(detectPm2Format(''), 'empty');
  assert.equal(detectPm2Format('   \n  '), 'empty');

  // Something is there, but it is not a shape we know.
  assert.equal(detectPm2Format('pm2: command not found'), 'unknown');
  assert.equal(detectPm2Format(`${proc}\nrandom text`), 'unknown');
});

test('parses every detected pm2 shape into the same app list', () => {
  const proc = '{"name":"api","pm2_env":{"status":"online","pm_exec_path":"/srv/api.js"}}';
  const expected = [{ name: 'api', detail: '/srv/api.js', status: 'online' }];

  const shapes: Record<string, string> = {
    array: `[${proc}]`,
    prettyArray: `[\n  ${proc}\n]`,
    jsonl: `${proc}\n${proc}\n${proc}`,
    single: proc
  };

  for (const [shape, payload] of Object.entries(shapes)) {
    const apps = parseRunningApps(`---PM2---\n${payload}\n---END---`).filter((a) => a.kind === 'pm2');
    const want = shape === 'jsonl' ? 3 : 1;
    assert.equal(apps.length, want, `${shape} should yield ${want} app(s)`);
    assert.equal(apps[0]?.name, expected[0]?.name, shape);
    assert.equal(apps[0]?.detail, expected[0]?.detail, shape);
    assert.equal(apps[0]?.status, expected[0]?.status, shape);
  }
});

test('tolerates CRLF, ANSI colour codes and stray notice lines', () => {
  // SSH exec returns CRLF; PM2 colourises and prints an update notice.
  const proc = '{"name":"chatbot-api","pm2_env":{"status":"online","pm_exec_path":"/srv/chat.js"}}';
  const noisy = [
    '[32m[PM2] Updatable modules available[0m',
    '[32m┌──────────┐[0m',
    proc,
    '[32m└──────────┘[0m'
  ].join('\r\n');

  const apps = parseRunningApps(`---PM2---\r\n${noisy}\r\n---END---`).filter((a) => a.kind === 'pm2');

  // Noise means the shape is `unknown`, but the real record must still be found.
  assert.equal(detectPm2Format(noisy), 'unknown');
  assert.equal(apps.length, 1, 'a valid record must survive surrounding noise');
  assert.equal(apps[0]?.name, 'chatbot-api');
  assert.equal(apps[0]?.detail, '/srv/chat.js');
});

test('an unreadable pm2 payload yields no apps instead of throwing', () => {
  assert.equal(parseRunningApps('---PM2---\nnot json at all\n---END---').length, 0);
  assert.equal(parseRunningApps('---PM2---\n[{"name":"x"\n---END---').length, 0);
  assert.equal(parseRunningApps('---PM2---\n---END---').length, 0);
});

test('keeps pm2 apps even when the process has no script path', () => {
  // Regression: filtering on empty `detail` silently dropped these apps.
  const raw = [
    '---PM2---',
    JSON.stringify([{ name: 'daemon', pm2_env: { status: 'online' } }]),
    '---END---'
  ].join('\n');
  const apps = parseRunningApps(raw);
  assert.equal(apps.length, 1);
  assert.equal(apps[0]?.name, 'daemon');
  assert.equal(apps[0]?.status, 'online');
  assert.equal(apps[0]?.detail, '');
});

test('reports which runtimes answered so an empty group can explain itself', () => {
  const raw = [
    '---PM2FOUND---',
    'no',
    '---END---',
    '---PM2---',
    '[]',
    '---END---',
    '---DOCKER---',
    'web|nginx:alpine|Up 2 hours',
    '---END---',
    '---SYSTEMD---',
    '---END---'
  ].join('\n');

  const avail = parseSourceAvailability(raw);
  assert.equal(avail.pm2, false, 'pm2 binary was not found');
  assert.equal(avail.docker, true, 'docker returned a container');
  assert.equal(avail.systemd, false, 'systemd returned nothing');
  assert.equal(avail.dockerNeedsSudo, false);

  const found = parseSourceAvailability('---PM2FOUND---\nyes\n---END---');
  assert.equal(found.pm2, true);
});

test('detects when docker was only reachable through sudo', () => {
  // Regression: a permission error must not be reported as "docker not found",
  // because those send the user looking in completely the wrong place.
  const needsSudo = [
    '---DOCKER---',
    '---END---',
    '---DOCKERSUDO---',
    'yes',
    '---END---'
  ].join('\n');
  assert.equal(parseSourceAvailability(needsSudo).dockerNeedsSudo, true);

  const plain = [
    '---DOCKER---',
    'web|nginx|Up 1 hour',
    '---END---',
    '---DOCKERSUDO---',
    'no',
    '---END---'
  ].join('\n');
  assert.equal(parseSourceAvailability(plain).dockerNeedsSudo, false);

  assert.equal(parseSourceAvailability('').dockerNeedsSudo, false);
});

test('an older backend reports availability as unknown rather than absent', () => {
  // Regression: without the PM2FOUND marker we used to claim "pm2 not found",
  // which is a guess. Unknown must stay unknown.
  const legacy = ['---PM2---', '[]', '---END---', '---DOCKER---', 'web|nginx|Up 1 hour', '---END---'].join('\n');
  const avail = parseSourceAvailability(legacy);
  assert.equal(avail.pm2, null, 'must not claim pm2 is missing when the marker is absent');
  assert.equal(avail.docker, true);

  const empty = parseSourceAvailability('');
  assert.deepEqual(empty, {
    pm2: null,
    docker: null,
    systemd: null,
    webroot: null,
    dockerNeedsSudo: false
  });
});

test('keeps the tilde unquoted so the shell can expand the home directory', () => {
  // Regression: `tail '~/.pm2/logs/api-out.log'` never expands ~ and always fails.
  const cmd = buildLogCommand({ kind: 'pm2', name: '~/.pm2/logs/api-out.log' }, 200, false);
  assert.equal(cmd, "tail -n 200 ~/'.pm2/logs/api-out.log'");
  assert.ok(cmd.startsWith('tail -n 200 ~/'), 'tilde must be a bare word');
  assert.ok(!cmd.includes("'~"), 'tilde must not be inside quotes');
});

/** Undo POSIX single-quote escaping so we can prove the argument survived intact. */
function shellUnquote(shelled: string): string {
  assert.ok(shelled.startsWith("'") && shelled.endsWith("'"), `not single-quoted: ${shelled}`);
  return shelled.slice(1, -1).replace(/'\\''/g, "'");
}

test('a crafted app name stays one shell argument instead of chaining a command', () => {
  const hostile = "~/.pm2/logs/x'; rm -rf /; echo 'y.log";
  const cmd = buildLogCommand({ kind: 'pm2', name: hostile }, 10, false);

  assert.ok(cmd.startsWith('tail -n 10 ~/'), cmd);

  // The whole tail argument must still round-trip back to the original path,
  // which is only true if every quote in it was escaped rather than terminating.
  const arg = cmd.slice('tail -n 10 ~/'.length);
  assert.equal(shellUnquote(arg), hostile.slice(2));

  // A real breakout would leave a quote that closes early, so the shelled form
  // would no longer be balanced. Escaped quotes never satisfy that.
  assert.equal(shellUnquote(arg).split("'").length - 1, 2, 'both quotes must survive as data');
});

test('parses webroot apps that no process manager would report', () => {
  // Regression: a Laravel or WordPress install has no PM2 process and no systemd
  // unit, so before the document-root scan it simply did not exist to the user.
  const raw = [
    '---PM2---',
    '[]',
    '---END---',
    '---DOCKER---',
    '---END---',
    '---SYSTEMD---',
    '---END---',
    '---WEBROOT---',
    'shop|/var/www/shop|Laravel|/var/www/shop/storage/logs/laravel.log',
    'blog|/var/www/blog|WordPress|',
    '---END---'
  ].join('\n');

  const apps = parseRunningApps(raw);
  const shop = apps.find((a) => a.name === 'shop');
  const blog = apps.find((a) => a.name === 'blog');

  assert.equal(shop?.kind, 'webroot');
  assert.equal(shop?.detail, 'Laravel');
  assert.equal(shop?.logFile, '/var/www/shop/storage/logs/laravel.log');
  assert.equal(shop?.path, '/var/www/shop');

  // No log on disk means `undefined`, not an empty string, so the viewer can say
  // the app has no readable log instead of tailing an empty path.
  assert.equal(blog?.logFile, undefined);
  assert.equal(blog?.status, 'deployed');
});

test('webroot availability is unknown when the backend predates the scan', () => {
  const legacy = ['---PM2---', '[]', '---END---', '---DOCKER---', '---END---'].join('\n');
  assert.equal(parseSourceAvailability(legacy).webroot, null, 'must not claim an empty document root');
});

test('webroot availability is reported when the section is present', () => {
  const raw = ['---PM2---', '[]', '---END---', '---WEBROOT---', 'app|/var/www/app|Laravel|', '---END---'].join('\n');
  assert.equal(parseSourceAvailability(raw).webroot, true);

  const empty = ['---PM2---', '[]', '---END---', '---WEBROOT---', '---END---'].join('\n');
  assert.equal(parseSourceAvailability(empty).webroot, false);
});

test('a webroot log path is shell quoted like any other file', () => {
  const cmd = buildLogCommand({ kind: 'file', name: '/var/www/shop/storage/logs/laravel.log' }, 100, true);
  assert.equal(cmd, "tail -n 100 -f '/var/www/shop/storage/logs/laravel.log'");
});
