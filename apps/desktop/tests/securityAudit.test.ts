import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSecurityAuditScript,
  parseSecurityAuditOutput
} from '../app/utils/securityAuditor.ts';

test('buildSecurityAuditScript formats bash command correctly', () => {
  const normalCmd = buildSecurityAuditScript(false);
  assert.ok(normalCmd.includes('===BOBA_SECTION:SSH==='));
  assert.ok(!normalCmd.includes('sudo sshd -T'));

  const sudoCmd = buildSecurityAuditScript(true);
  assert.ok(sudoCmd.includes('sudo sshd -T'));
  assert.ok(sudoCmd.includes('sudo ufw status'));
});

test('parseSecurityAuditOutput handles fully hardened server', () => {
  const mockOutput = `
===BOBA_SECTION:SSH===
permitrootlogin prohibit-password
passwordauthentication no
port 2222
maxauthtries 3

===BOBA_SECTION:FIREWALL===
ufw:active
iptables:configured

===BOBA_SECTION:AUTH===
fail2ban:active

===BOBA_SECTION:SYSTEM===
reboot_required:no
auto_updates:yes
core_dumps:0
tcp_syncookies:1
ip_forward:0
`;

  const report = parseSecurityAuditOutput(mockOutput);
  assert.equal(report.grade, 'A');
  assert.equal(report.score, 100);
  assert.equal(report.summary.fail, 0);
  assert.equal(report.summary.warn, 0);
  assert.ok(report.summary.pass >= 8);

  const rootCheck = report.items.find((i) => i.id === 'ssh_root_login');
  assert.equal(rootCheck?.status, 'pass');

  const passAuthCheck = report.items.find((i) => i.id === 'ssh_password_auth');
  assert.equal(passAuthCheck?.status, 'pass');

  const dbCheck = report.items.find((i) => i.id === 'db_port_exposure');
  assert.equal(dbCheck?.status, 'pass');
});

test('parseSecurityAuditOutput detects vulnerabilities and exposed ports', () => {
  const mockVulnerableOutput = `
===BOBA_SECTION:SSH===
permitrootlogin yes
passwordauthentication yes
port 22

===BOBA_SECTION:FIREWALL===
ufw:inactive
iptables:default
0.0.0.0:3306 0.0.0.0:* users:(("mysqld",pid=123,fd=4))
0.0.0.0:6379 0.0.0.0:* users:(("redis-server",pid=456,fd=5))

===BOBA_SECTION:AUTH===
empty_pass:testbaduser
extra_uid_0:backdooruser
fail2ban:inactive

===BOBA_SECTION:SYSTEM===
reboot_required:yes
auto_updates:no
core_dumps:1
tcp_syncookies:0
`;

  const report = parseSecurityAuditOutput(mockVulnerableOutput);
  assert.ok(report.score < 40);
  assert.equal(report.grade, 'F');
  assert.ok(report.summary.fail >= 4);

  const rootCheck = report.items.find((i) => i.id === 'ssh_root_login');
  assert.equal(rootCheck?.status, 'fail');
  assert.ok(rootCheck?.remediationCmd?.includes('PermitRootLogin prohibit-password'));

  const dbCheck = report.items.find((i) => i.id === 'db_port_exposure');
  assert.equal(dbCheck?.status, 'fail');
  assert.ok(dbCheck?.observedValue.includes('3306'));

  const emptyPassCheck = report.items.find((i) => i.id === 'empty_passwords');
  assert.equal(emptyPassCheck?.status, 'fail');
  assert.equal(emptyPassCheck?.observedValue, 'testbaduser');

  const extraUidCheck = report.items.find((i) => i.id === 'extra_uid_zero');
  assert.equal(extraUidCheck?.status, 'fail');
  assert.equal(extraUidCheck?.observedValue, 'backdooruser');
});

test('parseSecurityAuditOutput handles empty or corrupt output gracefully', () => {
  const report = parseSecurityAuditOutput('');
  assert.ok(report.items.length > 0);
  assert.equal(typeof report.score, 'number');
  assert.ok(['A', 'B', 'C', 'D', 'F'].includes(report.grade));
});
