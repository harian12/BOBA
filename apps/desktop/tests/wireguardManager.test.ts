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
  buildWireguardLogsCommand,
  buildPeerLogsCommand,
  buildEnableDynamicDebugCommand,
  buildWireguardLiveStreamCommand,
  buildPeerLiveStreamCommand,
  extractClientCommentName,
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

test('extractClientCommentName handles various WireGuard comment formats', () => {
  assert.equal(extractClientCommentName('### Client hari'), 'hari');
  assert.equal(extractClientCommentName('### Client finance'), 'finance');
  assert.equal(extractClientCommentName('### Client: santara1'), 'santara1');
  assert.equal(extractClientCommentName('### Client Gede_P_Janotama'), 'Gede_P_Janotama');
  assert.equal(extractClientCommentName('# Friendly Name: Kus_Aditya'), 'Kus_Aditya');
  assert.equal(extractClientCommentName('### begin putrii ###'), 'putrii');
  assert.equal(extractClientCommentName('# User: Dea'), 'Dea');
  assert.equal(extractClientCommentName('# Asri_Noviastuti'), 'Asri_Noviastuti');
  assert.equal(extractClientCommentName('# Interface'), null);
  assert.equal(extractClientCommentName('# Address = 10.7.0.1/24'), null);
});

test('parseWireguardStatus parses angristan / wireguard-install format with real usernames', () => {
  const angristanOutput = `
---WG_CHECK_START---
INSTALLED=true
interface: wg0
  public key: 0/fxVeC9Shs0fOOAU+Em41lJo1mzNax4Ba9lZ6yZwkk=
  listening port: 51820

peer: /tcYb2jg/5...HJH34=
  endpoint: 114.122.1.2:48392
  allowed ips: 10.7.0.11/32
  latest handshake: 3 seconds ago
  transfer: 1.16 GiB received, 14.14 GiB sent

peer: P8f3+/Gu1K...jPMhQ=
  endpoint: 180.244.5.6:59123
  allowed ips: 10.7.0.2/32
  latest handshake: 1 minute, 6 seconds ago
  transfer: 1.81 GiB received, 7.08 GiB sent

peer: GedeKey123456789=
  allowed ips: 10.7.0.8/32

---WG_CONF_START---
[Interface]
Address = 10.7.0.1/24
PrivateKey = privkey123
ListenPort = 51820
PostUp = iptables ...
PostDown = iptables ...

### Client hari
[Peer]
PublicKey = P8f3+/Gu1K...jPMhQ=
PresharedKey = psk1
AllowedIPs = 10.7.0.2/32

### Client Gede_P_Janotama
[Peer]
PublicKey = GedeKey123456789=
PresharedKey = psk2
AllowedIPs = 10.7.0.8/32

### Client Dea
[Peer]
PublicKey = /tcYb2jg/5...HJH34=
PresharedKey = psk3
AllowedIPs = 10.7.0.11/32
---WG_CHECK_END---
  `;

  const parsed = parseWireguardStatus(angristanOutput);
  assert.equal(parsed.peers.length, 3);

  const deaPeer = parsed.peers.find(p => p.publicKey === '/tcYb2jg/5...HJH34=');
  assert.ok(deaPeer);
  assert.equal(deaPeer.name, 'Dea');
  assert.equal(deaPeer.allowedIps, '10.7.0.11/32');
  assert.equal(deaPeer.isActive, true);

  const hariPeer = parsed.peers.find(p => p.publicKey === 'P8f3+/Gu1K...jPMhQ=');
  assert.ok(hariPeer);
  assert.equal(hariPeer.name, 'hari');
  assert.equal(hariPeer.allowedIps, '10.7.0.2/32');

  const gedePeer = parsed.peers.find(p => p.publicKey === 'GedeKey123456789=');
  assert.ok(gedePeer);
  assert.equal(gedePeer.name, 'Gede_P_Janotama');
  assert.equal(gedePeer.allowedIps, '10.7.0.8/32');
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

  const deletePeerCmd = buildDeletePeerCommand('pubkeyToRemove==', 'hari', false);
  assert.match(deletePeerCmd, /wg set wg0 peer "pubkeyToRemove==" remove/);
  assert.match(deletePeerCmd, /awk/);
  assert.match(deletePeerCmd, /hari/);

  const stopCmd = buildServiceControlCommand('stop', false);
  assert.match(stopCmd, /wg-quick down/);

  const uninstCmd = buildUninstallWireguardScript(false);
  assert.match(uninstCmd, /rm -f \/etc\/wireguard\/wg0.conf/);

  const logsCmd = buildWireguardLogsCommand(50, true, 'pass');
  assert.match(logsCmd, /journalctl -u wg-quick@wg0/);
  assert.match(logsCmd, /dmesg/);
  assert.match(logsCmd, /wg show wg0/);

  const peerLogsCmd = buildPeerLogsCommand('myPublicKey123456789==', true, 'pass');
  assert.match(peerLogsCmd, /myPublicKey123456789==/);
  assert.match(peerLogsCmd, /dmesg/);

  const debugCmd = buildEnableDynamicDebugCommand(true, 'pass');
  assert.match(debugCmd, /dynamic_debug/);

  const liveServiceCmd = buildWireguardLiveStreamCommand(true, 'pass');
  assert.match(liveServiceCmd, /journalctl -fu wg-quick@wg0/);

  const livePeerCmd = buildPeerLiveStreamCommand('myPublicKey123456789==', true, 'pass');
  assert.match(livePeerCmd, /dmesg -w/);
  assert.match(livePeerCmd, /myPublicKe/);
});
