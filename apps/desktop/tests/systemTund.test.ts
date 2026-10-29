import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDeployScript,
  buildStatusCheckCommand,
  buildUninstallCommand,
  buildHealTriggerCommand,
  parseSystemTundStatus,
  generateRandomSecretToken,
} from '../app/utils/systemTund.ts';
import type { SystemTundConfig } from '../app/utils/systemTund.ts';

test('generateRandomSecretToken returns token with prefix and correct length', () => {
  const token = generateRandomSecretToken(24);
  assert.match(token, /^boba_tund_[A-Za-z0-9]{24}$/);
});

test('generateDeployScript creates valid bash command with base64 components', () => {
  const config: SystemTundConfig = {
    port: 8443,
    secretToken: 'test_token_123',
    targetPort: 22,
    authorizedKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI...',
    sshUser: 'root',
  };

  const script = generateDeployScript(config, true);
  assert.ok(script.includes('/usr/local/bin/system-tund'));
  assert.ok(script.includes('/etc/system-tund.conf'));
  assert.ok(script.includes('/etc/systemd/system/system-tund.service'));
  assert.ok(script.includes('systemctl daemon-reload'));
  assert.ok(script.includes('systemctl enable --now system-tund'));
  assert.ok(script.includes('sudo '));
});

test('buildStatusCheckCommand creates valid status query', () => {
  const cmd = buildStatusCheckCommand(false);
  assert.ok(cmd.includes('systemctl is-active system-tund'));
  assert.ok(cmd.includes('/etc/system-tund.conf'));
});

test('buildUninstallCommand stops service and removes files', () => {
  const cmd = buildUninstallCommand(false);
  assert.ok(cmd.includes('systemctl stop system-tund'));
  assert.ok(cmd.includes('systemctl disable system-tund'));
  assert.ok(cmd.includes('rm -f /etc/systemd/system/system-tund.service'));
  assert.ok(cmd.includes('systemctl daemon-reload'));
});

test('buildHealTriggerCommand checks key and appends if missing', () => {
  const cmd = buildHealTriggerCommand({
    sshUser: 'ubuntu',
    authorizedKey: 'ssh-ed25519 AAAAB3NzaC1lZDI1NTE5AAAAIG...',
  }, false);
  assert.ok(cmd.includes('/home/ubuntu/.ssh'));
  assert.ok(cmd.includes('authorized_keys'));
  assert.ok(cmd.includes('chmod 600'));
});

test('parseSystemTundStatus parses active running output', () => {
  const raw = `
---STATUS_START---
INSTALLED=true
active
{
  "port": 8443,
  "secret_token": "boba_tund_xyz",
  "target_port": 22
}
---STATUS_END---
`;
  const status = parseSystemTundStatus(raw);
  assert.equal(status.isInstalled, true);
  assert.equal(status.isActive, true);
  assert.equal(status.serviceStatus, 'active');
  assert.equal(status.port, 8443);
});

test('parseSystemTundStatus parses uninstalled status', () => {
  const raw = `
---STATUS_START---
INSTALLED=false
inactive
{}
---STATUS_END---
`;
  const status = parseSystemTundStatus(raw);
  assert.equal(status.isInstalled, false);
  assert.equal(status.isActive, false);
  assert.equal(status.serviceStatus, 'not-installed');
});
