/**
 * wireguardManager.ts
 * Engine & deployment generator for WireGuard VPN server and client mesh.
 */

export interface WireguardServerConfig {
  serverAddress: string;     // e.g. "10.99.0.1/24"
  listenPort: number;         // e.g. 51820
  serverPrivateKey: string;
  serverPublicKey: string;
  clientAddress: string;     // e.g. "10.99.0.2/32"
  clientPrivateKey: string;
  clientPublicKey: string;
  serverPublicIp: string;
  authorizedKey?: string;     // Boba SSH public key for self-healing
  sshUser?: string;          // Target SSH user (e.g. root or anaverse)
}

export interface WireguardPeerStatus {
  publicKey: string;
  endpoint?: string;
  allowedIps?: string;
  latestHandshake?: string;
  transferRx?: string;
  transferTx?: string;
}

export interface WireguardStatus {
  isInstalled: boolean;
  isActive: boolean;
  interfaceName?: string;
  serverPublicKey?: string;
  listenPort?: number;
  serverPrivateKey?: string;
  clientPublicKey?: string;
  peers: WireguardPeerStatus[];
}

/**
 * Generate server WireGuard configuration (/etc/wireguard/wg0.conf)
 */
export function generateServerWgConfig(cfg: WireguardServerConfig): string {
  return `[Interface]
Address = ${cfg.serverAddress}
ListenPort = ${cfg.listenPort}
PrivateKey = ${cfg.serverPrivateKey}
SaveConfig = false
PostUp = iptables -I INPUT 1 -i %i -j ACCEPT; iptables -I FORWARD 1 -i %i -j ACCEPT; which ufw >/dev/null 2>&1 && ufw allow in on %i 2>/dev/null || true
PostDown = iptables -D INPUT -i %i -j ACCEPT 2>/dev/null; iptables -D FORWARD -i %i -j ACCEPT 2>/dev/null || true

[Peer]
PublicKey = ${cfg.clientPublicKey}
AllowedIPs = ${cfg.clientAddress}
`;
}

/**
 * Generate client WireGuard configuration (e.g. for Windows/macOS/Mobile client)
 */
export function generateClientWgConfig(cfg: WireguardServerConfig): string {
  // Use clientAddress without CIDR or with /24 for client interface
  const clientIfAddr = cfg.clientAddress.includes('/')
    ? cfg.clientAddress.replace('/32', '/24')
    : `${cfg.clientAddress}/24`;

  return `[Interface]
PrivateKey = ${cfg.clientPrivateKey}
Address = ${clientIfAddr}
DNS = 1.1.1.1

[Peer]
PublicKey = ${cfg.serverPublicKey}
Endpoint = ${cfg.serverPublicIp}:${cfg.listenPort}
AllowedIPs = 10.99.0.0/24
PersistentKeepalive = 25
`;
}

export function encodeWgBase64(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8').toString('base64');
  }
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Generates bash commands to install WireGuard, enable IP forwarding, write config, and start service.
 */
export function generateWireguardInstallScript(cfg: WireguardServerConfig, useSudo = false, sudoPass?: string): string {
  // If sshUser is not root or useSudo is true, enforce sudo
  const needSudo = useSudo || (cfg.sshUser && cfg.sshUser !== 'root');
  const sudo = needSudo ? 'sudo ' : '';
  const sudoAuth = needSudo && sudoPass?.trim()
    ? `echo '${sudoPass.replace(/'/g, "'\\''")}' | sudo -S -v`
    : (needSudo ? 'sudo -v 2>/dev/null || true' : '');

  const serverConf = generateServerWgConfig(cfg);
  const confB64 = encodeWgBase64(serverConf);

  const steps = [
    sudoAuth,
    'echo "[1/5] Memeriksa & memasang paket WireGuard..."',
    `which wg >/dev/null 2>&1 || (which apt-get >/dev/null 2>&1 && ${sudo}-E env DEBIAN_FRONTEND=noninteractive apt-get update -y && ${sudo}-E env DEBIAN_FRONTEND=noninteractive apt-get install -y wireguard iptables) || (which dnf >/dev/null 2>&1 && ${sudo}dnf install -y wireguard-tools iptables) || (which yum >/dev/null 2>&1 && ${sudo}yum install -y epel-release wireguard-tools iptables) || (which apk >/dev/null 2>&1 && ${sudo}apk add wireguard-tools iptables) || true`,
    'echo "[2/5] Mengaktifkan IPv4 forwarding di kernel..."',
    `${sudo}sysctl -w net.ipv4.ip_forward=1 >/dev/null 2>&1 || true`,
    `echo "net.ipv4.ip_forward=1" | ${sudo}tee -a /etc/sysctl.d/99-wireguard.conf >/dev/null 2>&1 || true`,
    'echo "[3/5] Menulis konfigurasi /etc/wireguard/wg0.conf..."',
    `${sudo}mkdir -p /etc/wireguard`,
    `${sudo}chmod 700 /etc/wireguard`,
    `echo "${confB64}" | base64 -d | ${sudo}tee /etc/wireguard/wg0.conf >/dev/null`,
    `${sudo}chmod 600 /etc/wireguard/wg0.conf`,
    'echo "[4/5] Membuka port UDP di firewall (UFW, Firewalld, iptables) & mengizinkan trafik wg0..."',
    `which ufw >/dev/null 2>&1 && (${sudo}ufw allow ${cfg.listenPort}/udp >/dev/null 2>&1 && ${sudo}ufw allow in on wg0 >/dev/null 2>&1 || true)`,
    `which firewall-cmd >/dev/null 2>&1 && (${sudo}firewall-cmd --add-port=${cfg.listenPort}/udp --permanent >/dev/null 2>&1 && ${sudo}firewall-cmd --add-interface=wg0 --zone=trusted --permanent >/dev/null 2>&1 && ${sudo}firewall-cmd --reload >/dev/null 2>&1 || true)`,
    `${sudo}iptables -C INPUT -p udp --dport ${cfg.listenPort} -j ACCEPT 2>/dev/null || ${sudo}iptables -I INPUT 1 -p udp --dport ${cfg.listenPort} -j ACCEPT 2>/dev/null || true`,
    `${sudo}iptables -C INPUT -i wg0 -j ACCEPT 2>/dev/null || ${sudo}iptables -I INPUT 1 -i wg0 -j ACCEPT 2>/dev/null || true`,
    'echo "[5/5] Mengaktifkan & memulai wg-quick@wg0..."',
    `${sudo}systemctl enable --now wg-quick@wg0 || ${sudo}wg-quick up wg0 2>/dev/null || true`,
  ];

  if (cfg.authorizedKey?.trim()) {
    const user = cfg.sshUser || 'root';
    const home = user === 'root' ? '/root' : `/home/${user}`;
    const keyEscaped = cfg.authorizedKey.trim().replace(/"/g, '\\"');
    steps.push(
      `echo "[Self-Healing] Memastikan SSH public key ada di ${home}/.ssh/authorized_keys..."`,
      `${sudo}mkdir -p ${home}/.ssh && ${sudo}chmod 700 ${home}/.ssh`,
      `grep -qF "${keyEscaped}" ${home}/.ssh/authorized_keys 2>/dev/null || (echo "${keyEscaped}" | ${sudo}tee -a ${home}/.ssh/authorized_keys >/dev/null && ${sudo}chmod 600 ${home}/.ssh/authorized_keys)`
    );
  }

  steps.push(
    'echo "Status WireGuard:"',
    `${sudo}wg show`
  );

  return steps.filter(Boolean).join(' && ');
}

export function buildWireguardHealKeyCommand(sshUser: string, authorizedKey: string, useSudo = false): string {
  const sudo = useSudo ? 'sudo ' : '';
  const home = sshUser === 'root' ? '/root' : `/home/${sshUser}`;
  const keyEscaped = authorizedKey.trim().replace(/"/g, '\\"');
  return `${sudo}mkdir -p ${home}/.ssh && grep -qF "${keyEscaped}" ${home}/.ssh/authorized_keys 2>/dev/null && echo "KEY_PRESENT" || (echo "${keyEscaped}" | ${sudo}tee -a ${home}/.ssh/authorized_keys >/dev/null && ${sudo}chmod 600 ${home}/.ssh/authorized_keys && echo "KEY_HEALED")`;
}

export function buildWireguardUpdateKeyCommand(sshUser: string, authorizedKey: string, useSudo = false): string {
  const sudo = useSudo ? 'sudo ' : '';
  const home = sshUser === 'root' ? '/root' : `/home/${sshUser}`;
  const keyEscaped = authorizedKey.trim().replace(/"/g, '\\"');
  return `${sudo}mkdir -p ${home}/.ssh && ${sudo}chmod 700 ${home}/.ssh && (grep -qF "${keyEscaped}" ${home}/.ssh/authorized_keys 2>/dev/null || echo "${keyEscaped}" | ${sudo}tee -a ${home}/.ssh/authorized_keys >/dev/null) && ${sudo}chmod 600 ${home}/.ssh/authorized_keys && echo "KEY_UPDATED"`;
}

export function buildOpenPortCommand(port: number, useSudo = false): string {
  const sudo = useSudo ? 'sudo ' : '';
  return [
    `which ufw >/dev/null 2>&1 && (${sudo}ufw allow ${port}/udp 2>/dev/null && ${sudo}ufw allow in on wg0 2>/dev/null || true)`,
    `which firewall-cmd >/dev/null 2>&1 && (${sudo}firewall-cmd --add-port=${port}/udp --permanent 2>/dev/null && ${sudo}firewall-cmd --add-interface=wg0 --zone=trusted --permanent 2>/dev/null && ${sudo}firewall-cmd --reload 2>/dev/null || true)`,
    `${sudo}iptables -C INPUT -p udp --dport ${port} -j ACCEPT 2>/dev/null || ${sudo}iptables -I INPUT 1 -p udp --dport ${port} -j ACCEPT 2>/dev/null || true`,
    `${sudo}iptables -C INPUT -i wg0 -j ACCEPT 2>/dev/null || ${sudo}iptables -I INPUT 1 -i wg0 -j ACCEPT 2>/dev/null || true`,
    `echo "PORT_OPENED_${port}"`,
  ].join(' ; ');
}

export function buildWireguardUninstallCommand(useSudo = false): string {
  const sudo = useSudo ? 'sudo ' : '';
  return `${sudo}systemctl stop wg-quick@wg0 2>/dev/null || ${sudo}wg-quick down wg0 2>/dev/null || true ; ${sudo}systemctl disable wg-quick@wg0 2>/dev/null || true ; ${sudo}rm -f /etc/wireguard/wg0.conf /etc/sysctl.d/99-wireguard.conf ; echo "WG_UNINSTALLED_OK"`;
}

/**
 * Command to check WireGuard status on server
 */
export function buildWireguardStatusCheckCommand(useSudo = false, sudoPass?: string): string {
  const sudo = useSudo ? 'sudo ' : '';
  const sudoAuth = useSudo && sudoPass?.trim()
    ? `echo '${sudoPass.replace(/'/g, "'\\''")}' | sudo -S -v 2>/dev/null || true`
    : (useSudo ? 'sudo -v 2>/dev/null || true' : '');

  return [
    sudoAuth,
    'echo "---WG_STATUS_START---"',
    'which wg >/dev/null 2>&1 && echo "INSTALLED=true" || echo "INSTALLED=false"',
    `${sudo}wg show 2>/dev/null || wg show 2>/dev/null || echo "WG_DOWN"`,
    'echo "---CONFIG_START---"',
    `${sudo}cat /etc/wireguard/wg0.conf 2>/dev/null || cat /etc/wireguard/wg0.conf 2>/dev/null || echo ""`,
    'echo "---WG_STATUS_END---"',
  ].filter(Boolean).join(' ; ');
}

/**
 * Parse output of `wg show` and `/etc/wireguard/wg0.conf`
 */
export function parseWireguardStatus(output: string): WireguardStatus {
  const isInstalled = output.includes('INSTALLED=true') || (!output.includes('INSTALLED=false') && output.includes('interface:'));
  const lines = output.trim().split('\n');

  let isActive = false;
  let interfaceName: string | undefined;
  let serverPublicKey: string | undefined;
  let listenPort: number | undefined;
  let serverPrivateKey: string | undefined;
  let clientPublicKey: string | undefined;
  const peers: WireguardPeerStatus[] = [];

  let currentPeer: WireguardPeerStatus | null = null;
  let inConfigSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '---CONFIG_START---') {
      inConfigSection = true;
      continue;
    }
    if (trimmed === '---WG_STATUS_END---') {
      inConfigSection = false;
      continue;
    }

    if (inConfigSection) {
      if (trimmed.startsWith('PrivateKey =') || trimmed.startsWith('PrivateKey=')) {
        serverPrivateKey = trimmed.split('=')[1]?.trim();
      }
      if (trimmed.startsWith('PublicKey =') || trimmed.startsWith('PublicKey=')) {
        clientPublicKey = trimmed.split('=')[1]?.trim();
      }
      continue;
    }

    if (trimmed.startsWith('interface:')) {
      isActive = true;
      interfaceName = trimmed.replace('interface:', '').trim();
    } else if (trimmed.startsWith('public key:') && !currentPeer) {
      serverPublicKey = trimmed.replace('public key:', '').trim();
    } else if (trimmed.startsWith('listening port:')) {
      const p = parseInt(trimmed.replace('listening port:', '').trim(), 10);
      if (!isNaN(p)) listenPort = p;
    } else if (trimmed.startsWith('peer:')) {
      if (currentPeer) peers.push(currentPeer);
      currentPeer = {
        publicKey: trimmed.replace('peer:', '').trim(),
      };
    } else if (currentPeer) {
      if (trimmed.startsWith('endpoint:')) {
        currentPeer.endpoint = trimmed.replace('endpoint:', '').trim();
      } else if (trimmed.startsWith('allowed ips:')) {
        currentPeer.allowedIps = trimmed.replace('allowed ips:', '').trim();
      } else if (trimmed.startsWith('latest handshake:')) {
        currentPeer.latestHandshake = trimmed.replace('latest handshake:', '').trim();
      } else if (trimmed.startsWith('transfer:')) {
        const transferStr = trimmed.replace('transfer:', '').trim();
        const parts = transferStr.split(',');
        if (parts[0]) currentPeer.transferRx = parts[0].trim();
        if (parts[1]) currentPeer.transferTx = parts[1].trim();
      }
    }
  }

  if (currentPeer) {
    peers.push(currentPeer);
  }

  return {
    isInstalled,
    isActive,
    interfaceName,
    serverPublicKey,
    listenPort,
    serverPrivateKey,
    clientPublicKey,
    peers,
  };
}

/**
 * Command to generate a WireGuard keypair on server via `wg genkey`
 */
export function buildKeygenCommand(): string {
  return `which wg >/dev/null 2>&1 && PRIV=$(wg genkey) && PUB=$(echo "$PRIV" | wg pubkey) && echo "$PRIV $PUB" || echo "NO_WG"`;
}

export function buildWgFullKeygenCommand(useSudo = false): string {
  const sudo = useSudo ? 'sudo ' : '';
  return `which wg >/dev/null 2>&1 || (which apt-get >/dev/null 2>&1 && ${sudo}-E env DEBIAN_FRONTEND=noninteractive apt-get update -y && ${sudo}-E env DEBIAN_FRONTEND=noninteractive apt-get install -y wireguard-tools) || true ; S_PRIV=$(wg genkey 2>/dev/null) ; S_PUB=$(echo "$S_PRIV" | wg pubkey 2>/dev/null) ; C_PRIV=$(wg genkey 2>/dev/null) ; C_PUB=$(echo "$C_PRIV" | wg pubkey 2>/dev/null) ; echo "WG_KEYS:$S_PRIV|$S_PUB|$C_PRIV|$C_PUB"`;
}

export function parseWgFullKeygenOutput(output: string): {
  serverPrivateKey: string;
  serverPublicKey: string;
  clientPrivateKey: string;
  clientPublicKey: string;
} | null {
  const line = output.split('\n').find(l => l.includes('WG_KEYS:'));
  if (!line) return null;
  const raw = line.replace(/.*WG_KEYS:/, '').trim();
  const parts = raw.split('|');
  if (parts.length === 4 && parts[0] && parts[1] && parts[2] && parts[3]) {
    return {
      serverPrivateKey: parts[0].trim(),
      serverPublicKey: parts[1].trim(),
      clientPrivateKey: parts[2].trim(),
      clientPublicKey: parts[3].trim(),
    };
  }
  return null;
}
