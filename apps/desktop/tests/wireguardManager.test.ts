import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateServerWgConfig,
  generateClientWgConfig,
  generateWireguardInstallScript,
  buildWireguardStatusCheckCommand,
  parseWireguardStatus,
  type WireguardServerConfig,
} from '../app/utils/wireguardManager.ts';

const dummyConfig: WireguardServerConfig = {
  serverAddress: '10.99.0.1/24',
  listenPort: 51820,
  serverPrivateKey: 'SERVER_PRIV_KEY==',
  serverPublicKey: 'SERVER_PUB_KEY==',
  clientAddress: '10.99.0.2/32',
  clientPrivateKey: 'CLIENT_PRIV_KEY==',
  clientPublicKey: 'CLIENT_PUB_KEY==',
  serverPublicIp: '103.150.227.17',
};

test('generateServerWgConfig produces valid wg0.conf format', () => {
  const conf = generateServerWgConfig(dummyConfig);
  assert.ok(conf.includes('[Interface]'));
  assert.ok(conf.includes('Address = 10.99.0.1/24'));
  assert.ok(conf.includes('ListenPort = 51820'));
  assert.ok(conf.includes('PrivateKey = SERVER_PRIV_KEY=='));
  assert.ok(conf.includes('[Peer]'));
  assert.ok(conf.includes('PublicKey = CLIENT_PUB_KEY=='));
  assert.ok(conf.includes('AllowedIPs = 10.99.0.2/32'));
});

test('generateClientWgConfig produces valid client conf format', () => {
  const conf = generateClientWgConfig(dummyConfig);
  assert.ok(conf.includes('[Interface]'));
  assert.ok(conf.includes('PrivateKey = CLIENT_PRIV_KEY=='));
  assert.ok(conf.includes('Address = 10.99.0.2/24'));
  assert.ok(conf.includes('[Peer]'));
  assert.ok(conf.includes('PublicKey = SERVER_PUB_KEY=='));
  assert.ok(conf.includes('Endpoint = 103.150.227.17:51820'));
  assert.ok(conf.includes('AllowedIPs = 10.99.0.0/24'));
  assert.ok(conf.includes('PersistentKeepalive = 25'));
});

test('generateWireguardInstallScript builds sequential bash script', () => {
  const script = generateWireguardInstallScript(dummyConfig, true);
  assert.ok(script.includes('/etc/wireguard/wg0.conf'));
  assert.ok(script.includes('sysctl -w net.ipv4.ip_forward=1'));
  assert.ok(script.includes('sudo '));
  assert.ok(script.includes('wg-quick@wg0'));
});

test('buildWireguardStatusCheckCommand creates query command', () => {
  const cmd = buildWireguardStatusCheckCommand(true);
  assert.ok(cmd.includes('wg show'));
  assert.ok(cmd.includes('/etc/wireguard/wg0.conf'));
});

test('parseWireguardStatus parses wg show output correctly', () => {
  const output = `
INSTALLED=true
interface: wg0
  public key: SERVER_PUB_123==
  private key: (hidden)
  listening port: 51820

peer: CLIENT_PUB_456==
  endpoint: 180.241.228.166:61234
  allowed ips: 10.99.0.2/32
  latest handshake: 1 minute, 12 seconds ago
  transfer: 4.12 MiB received, 1.84 MiB sent
`;
  const parsed = parseWireguardStatus(output);
  assert.equal(parsed.isInstalled, true);
  assert.equal(parsed.isActive, true);
  assert.equal(parsed.interfaceName, 'wg0');
  assert.equal(parsed.serverPublicKey, 'SERVER_PUB_123==');
  assert.equal(parsed.listenPort, 51820);
  assert.equal(parsed.peers.length, 1);
  assert.equal(parsed.peers[0]?.publicKey, 'CLIENT_PUB_456==');
  assert.equal(parsed.peers[0]?.allowedIps, '10.99.0.2/32');
  assert.ok(parsed.peers[0]?.latestHandshake?.includes('1 minute'));
  assert.ok(parsed.peers[0]?.transferRx?.includes('4.12 MiB'));
});

test('parseWireguardStatus handles uninstalled status', () => {
  const output = `
INSTALLED=false
WG_DOWN
`;
  const parsed = parseWireguardStatus(output);
  assert.equal(parsed.isInstalled, false);
  assert.equal(parsed.isActive, false);
  assert.equal(parsed.peers.length, 0);
});
