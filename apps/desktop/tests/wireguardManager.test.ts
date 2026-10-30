import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseWireguardStatus,
  getNextAvailableIp,
  generateClientConfigFile,
  parseAddPeerOutput,
  buildWireguardStatusCheckCommand,
  buildInstallWireguardScript,
  buildAddPeerCommand,
  buildDeletePeerCommand,
  buildServiceControlCommand,
  buildUninstallWireguardScript,
  formatSudoPrefix,
} from '../app/utils/wireguardManager.ts';

test('formatSudoPrefix returns correct prefix', () => {
  assert.equal(formatSudoPrefix(false), '');
  assert.match(formatSudoPrefix(true), /sudo/);
  assert.match(formatSudoPrefix(true, 'secret123'), /secret123/);
});

test('parseWireguardStatus parses installed, active, server info, and peers', () => {
  const sampleOutput = `
---WG_CHECK_START---
INSTALLED=true
interface: wg0
  public key: mHbEi78oO2/MQAnFsPumxiVjibw14iQL9h8aZGq6BiQ=
  private key: (hidden)
  listening port: 51820

peer: itHpBwvWMyBd3XJOZK2lKj5HZS9UqIPF/4dJrFzSPPQ=
  endpoint: 182.1.2.3:55123
  allowed ips: 10.99.0.2/32
  latest handshake: 1 minute, 12 seconds ago
  transfer: 2.14 MiB received, 10.82 MiB sent

peer: peer2PubKeyHere1234567890abcdef=
  allowed ips: 10.99.0.3/32
  latest handshake: 5 days ago
  transfer: 100 B received, 200 B sent

---WG_CONF_START---
[Interface]
Address = 10.99.0.1/24
ListenPort = 51820
PrivateKey = ABCPrivateKeyXYZ

### Client: laptop-budi
[Peer]
PublicKey = itHpBwvWMyBd3XJOZK2lKj5HZS9UqIPF/4dJrFzSPPQ=
AllowedIPs = 10.99.0.2/32

### Client: phone-andi
[Peer]
PublicKey = peer2PubKeyHere1234567890abcdef=
AllowedIPs = 10.99.0.3/32
---WG_CHECK_END---
  `;

  const parsed = parseWireguardStatus(sampleOutput);

  assert.equal(parsed.isInstalled, true);
  assert.equal(parsed.isActive, true);
  assert.equal(parsed.interfaceName, 'wg0');
  assert.equal(parsed.serverPublicKey, 'mHbEi78oO2/MQAnFsPumxiVjibw14iQL9h8aZGq6BiQ=');
  assert.equal(parsed.serverPrivateKey, 'ABCPrivateKeyXYZ');
  assert.equal(parsed.serverAddress, '10.99.0.1/24');
  assert.equal(parsed.listenPort, 51820);
  assert.equal(parsed.peers.length, 2);

  const peer1 = parsed.peers.find(p => p.name === 'laptop-budi');
  assert.ok(peer1);
  assert.equal(peer1.publicKey, 'itHpBwvWMyBd3XJOZK2lKj5HZS9UqIPF/4dJrFzSPPQ=');
  assert.equal(peer1.allowedIps, '10.99.0.2/32');
  assert.equal(peer1.endpoint, '182.1.2.3:55123');
  assert.equal(peer1.isActive, true);
  assert.equal(peer1.transferRx, '2.14 MiB received');
  assert.equal(peer1.transferTx, '10.82 MiB sent');

  const peer2 = parsed.peers.find(p => p.name === 'phone-andi');
  assert.ok(peer2);
  assert.equal(peer2.allowedIps, '10.99.0.3/32');
  assert.equal(peer2.isActive, undefined);
});

test('parseWireguardStatus handles when wireguard is not installed or down', () => {
  const notInstalled = `
---WG_CHECK_START---
INSTALLED=false
WG_DOWN
---WG_CONF_START---
---WG_CHECK_END---
  `;
  const p1 = parseWireguardStatus(notInstalled);
  assert.equal(p1.isInstalled, false);
  assert.equal(p1.isActive, false);
  assert.equal(p1.peers.length, 0);

  const installedButDown = `
---WG_CHECK_START---
INSTALLED=true
WG_DOWN
---WG_CONF_START---
[Interface]
Address = 10.99.0.1/24
ListenPort = 51820
PrivateKey = MYPRIVKEY

### Client: user-1
[Peer]
PublicKey = KEY123
AllowedIPs = 10.99.0.2/32
---WG_CHECK_END---
  `;
  const p2 = parseWireguardStatus(installedButDown);
  assert.equal(p2.isInstalled, true);
  assert.equal(p2.isActive, false);
  assert.equal(p2.serverPrivateKey, 'MYPRIVKEY');
  assert.equal(p2.peers.length, 1);
  assert.equal(p2.peers[0]?.name, 'user-1');
});

test('getNextAvailableIp correctly finds the lowest available host', () => {
  const peers = [
    { name: 'user1', publicKey: 'k1', allowedIps: '10.99.0.2/32' },
    { name: 'user2', publicKey: 'k2', allowedIps: '10.99.0.4/32' },
  ];
  // 10.99.0.3 is skipped, so it should be picked first
  assert.equal(getNextAvailableIp(peers, '10.99.0'), '10.99.0.3/32');

  const peersWith3 = [
    ...peers,
    { name: 'user3', publicKey: 'k3', allowedIps: '10.99.0.3/32' },
  ];
  // 2, 3, 4 are taken, so 5 should be next
  assert.equal(getNextAvailableIp(peersWith3, '10.99.0'), '10.99.0.5/32');
});

test('generateClientConfigFile generates valid WireGuard INI config', () => {
  const conf = generateClientConfigFile({
    name: 'laptop-kerja',
    clientPrivateKey: 'CLIENTPRIVKEY==',
    clientAddress: '10.99.0.2',
    dns: '1.1.1.1, 8.8.8.8',
    serverPublicKey: 'SERVERPUBKEY==',
    serverEndpoint: '103.150.227.17:51820',
    allowedIps: '0.0.0.0/0',
    persistentKeepalive: 25,
  });

  assert.match(conf, /# WireGuard Client: laptop-kerja/);
  assert.match(conf, /\[Interface\]/);
  assert.match(conf, /PrivateKey = CLIENTPRIVKEY==/);
  assert.match(conf, /Address = 10.99.0.2\/32/);
  assert.match(conf, /DNS = 1.1.1.1, 8.8.8.8/);
  assert.match(conf, /\[Peer\]/);
  assert.match(conf, /PublicKey = SERVERPUBKEY==/);
  assert.match(conf, /Endpoint = 103.150.227.17:51820/);
  assert.match(conf, /AllowedIPs = 0.0.0.0\/0/);
  assert.match(conf, /PersistentKeepalive = 25/);
});

test('parseAddPeerOutput parses delimiter string', () => {
  const output = `
line 1
line 2
WG_ADD_PEER_SUCCESS:NAME=laptop_budi|PRIV=mypriv123|PUB=mypub456|IP=10.99.0.2/32
`;
  const parsed = parseAddPeerOutput(output);
  assert.ok(parsed);
  assert.equal(parsed.name, 'laptop_budi');
  assert.equal(parsed.clientPrivateKey, 'mypriv123');
  assert.equal(parsed.clientPublicKey, 'mypub456');
  assert.equal(parsed.clientIp, '10.99.0.2/32');
});

test('command builders contain expected flags and keywords', () => {
  const checkCmd = buildWireguardStatusCheckCommand(true, 'pass');
  assert.match(checkCmd, /sudo/);
  assert.match(checkCmd, /---WG_CHECK_START---/);

  const installScript = buildInstallWireguardScript({
    publicIpOrDomain: '103.150.227.17',
    listenPort: 51820,
    serverAddress: '10.99.0.1/24',
  }, true, 'pass');
  assert.match(installScript, /apt-get install/);
  assert.match(installScript, /net.ipv4.ip_forward=1/);
  assert.match(installScript, /WG_INSTALL_SUCCESS/);

  const addPeerCmd = buildAddPeerCommand({
    name: 'test-device',
    clientIp: '10.99.0.5/32',
  }, false);
  assert.match(addPeerCmd, /### Client: test-device/);
  assert.match(addPeerCmd, /WG_ADD_PEER_SUCCESS/);

  const deletePeerCmd = buildDeletePeerCommand('pubkeyToRemove==', false);
  assert.match(deletePeerCmd, /wg set wg0 peer "pubkeyToRemove==" remove/);
  assert.match(deletePeerCmd, /awk/);

  const stopCmd = buildServiceControlCommand('stop', false);
  assert.match(stopCmd, /wg-quick down/);

  const uninstCmd = buildUninstallWireguardScript(false);
  assert.match(uninstCmd, /rm -f \/etc\/wireguard\/wg0.conf/);
});
