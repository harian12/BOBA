import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseListeningPorts,
  parseUfwStatus,
  buildUfwCommand,
  buildSsCommand,
  buildNetstatFallbackCommand,
} from '../app/utils/firewallParser.ts';

test('parseListeningPorts with ss -tulpn', () => {
  const ssOutput = `
Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port Process
tcp LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=1234,fd=3))
tcp LISTEN 0 511 *:80 *:* users:(("nginx",pid=5678,fd=6),("nginx",pid=5679,fd=6))
tcp LISTEN 0 4096 127.0.0.1:3306 0.0.0.0:* users:(("mysqld",pid=9012,fd=22))
udp UNCONN 0 0 0.0.0.0:5353 0.0.0.0:* users:(("avahi-daemon",pid=600,fd=12))
tcp LISTEN 0 128 [::]:22 [::]:* users:(("sshd",pid=1234,fd=4))
  `;
  const result = parseListeningPorts(ssOutput);

  assert.equal(result.length, 5);

  assert.equal(result[0]!.protocol, 'tcp');
  assert.equal(result[0]!.localAddress, '0.0.0.0');
  assert.equal(result[0]!.localPort, 22);
  assert.equal(result[0]!.peerAddress, '0.0.0.0');
  assert.equal(result[0]!.peerPort, undefined);
  assert.equal(result[0]!.state, 'LISTEN');
  assert.equal(result[0]!.processName, 'sshd');
  assert.equal(result[0]!.pid, 1234);

  assert.equal(result[1]!.protocol, 'tcp');
  assert.equal(result[1]!.localAddress, '*');
  assert.equal(result[1]!.localPort, 80);
  assert.equal(result[1]!.processName, 'nginx');
  assert.equal(result[1]!.pid, 5678);

  assert.equal(result[3]!.protocol, 'udp');
  assert.equal(result[3]!.state, 'UNCONN');
  assert.equal(result[3]!.localPort, 5353);
  assert.equal(result[3]!.processName, 'avahi-daemon');

  assert.equal(result[4]!.localAddress, '[::]');
  assert.equal(result[4]!.localPort, 22);
  assert.equal(result[4]!.peerAddress, '[::]');
});

test('parseListeningPorts with netstat -tulpn', () => {
  const netstatOutput = `
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      1234/sshd
tcp6       0      0 :::22                   :::*                    LISTEN      1234/sshd
udp        0      0 0.0.0.0:5353            0.0.0.0:*                           600/avahi-daemon
  `;
  const result = parseListeningPorts(netstatOutput);

  assert.equal(result.length, 3);

  assert.equal(result[0]!.protocol, 'tcp');
  assert.equal(result[0]!.localAddress, '0.0.0.0');
  assert.equal(result[0]!.localPort, 22);
  assert.equal(result[0]!.state, 'LISTEN');
  assert.equal(result[0]!.processName, 'sshd');
  assert.equal(result[0]!.pid, 1234);

  assert.equal(result[1]!.protocol, 'tcp6');
  assert.equal(result[1]!.localAddress, '::');
  assert.equal(result[1]!.localPort, 22);
  assert.equal(result[1]!.state, 'LISTEN');

  assert.equal(result[2]!.protocol, 'udp');
  assert.equal(result[2]!.state, 'UNCONN');
  assert.equal(result[2]!.processName, 'avahi-daemon');
  assert.equal(result[2]!.pid, 600);
});

test('parseUfwStatus numbered rules', () => {
  const ufwOutput = `
Status: active

     To                         Action      From
     --                         ------      ----
[ 1] 22/tcp                     ALLOW IN    Anywhere
[ 2] 80/tcp                     ALLOW IN    Anywhere
[ 3] 443                        ALLOW IN    Anywhere
[ 4] 5432                       DENY IN     Anywhere
[ 5] 22/tcp (v6)                ALLOW IN    Anywhere (v6)
  `;
  const result = parseUfwStatus(ufwOutput);

  assert.equal(result.active, true);
  assert.equal(result.rules.length, 5);

  assert.equal(result.rules[0]!.index, 1);
  assert.equal(result.rules[0]!.to, '22/tcp');
  assert.equal(result.rules[0]!.action, 'ALLOW');
  assert.equal(result.rules[0]!.direction, 'IN');
  assert.equal(result.rules[0]!.from, 'Anywhere');

  assert.equal(result.rules[3]!.index, 4);
  assert.equal(result.rules[3]!.to, '5432');
  assert.equal(result.rules[3]!.action, 'DENY');

  assert.equal(result.rules[4]!.index, 5);
  assert.equal(result.rules[4]!.to, '22/tcp (v6)');
  assert.equal(result.rules[4]!.from, 'Anywhere (v6)');
});

test('parseUfwStatus inactive', () => {
  const ufwOutput = `Status: inactive`;
  const result = parseUfwStatus(ufwOutput);

  assert.equal(result.active, false);
  assert.equal(result.rules.length, 0);
});

test('buildUfwCommand and others', () => {
  assert.equal(buildUfwCommand('allow', '80/tcp'), 'sudo ufw allow 80/tcp');
  assert.equal(buildUfwCommand('delete', 2), 'sudo ufw delete 2');
  assert.equal(buildUfwCommand('enable'), 'sudo ufw enable');
  assert.equal(buildUfwCommand('allow', '80', false), 'ufw allow 80');
  
  assert.equal(buildSsCommand(), 'sudo ss -tulpn');
  assert.equal(buildSsCommand(false), 'ss -tulpn');
  
  assert.equal(buildNetstatFallbackCommand(), 'sudo netstat -tulpn');
  assert.equal(buildNetstatFallbackCommand(false), 'netstat -tulpn');
});
