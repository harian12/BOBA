export interface WireguardPeer {
  name: string;
  publicKey: string;
  allowedIps: string;
  endpoint?: string;
  latestHandshake?: string;
  transferRx?: string;
  transferTx?: string;
  isActive?: boolean;
}

export interface WireguardServerStatus {
  isInstalled: boolean;
  isActive: boolean;
  interfaceName: string;
  serverPublicKey?: string;
  serverPrivateKey?: string;
  serverAddress: string;
  listenPort: number;
  peers: WireguardPeer[];
}

export interface WireguardInstallOptions {
  serverAddress?: string;
  listenPort?: number;
  publicIpOrDomain: string;
  serverPrivateKey?: string;
  serverPublicKey?: string;
  dns?: string;
}

export interface WireguardAddPeerOptions {
  name: string;
  clientIp: string;
  dns?: string;
  allowedIpsRouting?: 'split' | 'full';
  clientPrivateKey?: string;
  clientPublicKey?: string;
}

export interface WireguardClientConfig {
  name: string;
  clientPrivateKey: string;
  clientAddress: string;
  dns: string;
  serverPublicKey: string;
  serverEndpoint: string;
  allowedIps: string;
  persistentKeepalive?: number;
  rawConfig: string;
}

/**
 * Format sudo prefix and optional non-interactive auth
 */
export function formatSudoPrefix(useSudo: boolean, sudoPass?: string): string {
  if (!useSudo) return '';
  if (sudoPass && sudoPass.trim()) {
    const escaped = sudoPass.replace(/'/g, "'\\''");
    return `echo '${escaped}' | sudo -S -v 2>/dev/null || true ; sudo `;
  }
  return 'sudo -v 2>/dev/null || true ; sudo ';
}

/**
 * Command to check WireGuard installation, service status, and configuration
 */
export function buildWireguardStatusCheckCommand(useSudo = false, sudoPass?: string): string {
  const sudo = useSudo ? 'sudo ' : '';
  const sudoAuth = useSudo && sudoPass?.trim()
    ? `echo '${sudoPass.replace(/'/g, "'\\''")}' | sudo -S -v 2>/dev/null || true`
    : (useSudo ? 'sudo -v 2>/dev/null || true' : '');

  return [
    sudoAuth,
    'echo "---WG_CHECK_START---"',
    'which wg >/dev/null 2>&1 && echo "INSTALLED=true" || echo "INSTALLED=false"',
    `${sudo}wg show 2>/dev/null || wg show 2>/dev/null || echo "WG_DOWN"`,
    'echo "---WG_CONF_START---"',
    `${sudo}cat /etc/wireguard/wg0.conf 2>/dev/null || cat /etc/wireguard/wg0.conf 2>/dev/null || echo ""`,
    'echo "---WG_CHECK_END---"',
  ].filter(Boolean).join(' ; ');
}

/**
 * Parse output from buildWireguardStatusCheckCommand
 */
export function parseWireguardStatus(rawOutput: string): WireguardServerStatus {
  const isInstalled = rawOutput.includes('INSTALLED=true') || (!rawOutput.includes('INSTALLED=false') && rawOutput.includes('interface:'));

  let isActive = false;
  let interfaceName = 'wg0';
  let serverPublicKey: string | undefined;
  let serverPrivateKey: string | undefined;
  let serverAddress = '10.99.0.1/24';
  let listenPort = 51820;

  // Map to hold peers from config and runtime
  const peerMap = new Map<string, WireguardPeer>();

  const lines = rawOutput.split('\n');
  let inConfSection = false;
  let currentRuntimePeer: WireguardPeer | null = null;
  let pendingClientName = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();

    if (line === '---WG_CONF_START---') {
      if (currentRuntimePeer) {
        peerMap.set(currentRuntimePeer.publicKey, currentRuntimePeer);
        currentRuntimePeer = null;
      }
      inConfSection = true;
      continue;
    }

    if (line === '---WG_CHECK_END---') {
      inConfSection = false;
      continue;
    }

    if (!inConfSection) {
      // Parsing wg show
      if (line.startsWith('interface:')) {
        isActive = true;
        interfaceName = line.replace('interface:', '').trim() || 'wg0';
      } else if (line.startsWith('public key:') && !currentRuntimePeer) {
        serverPublicKey = line.replace('public key:', '').trim();
      } else if (line.startsWith('listening port:')) {
        const p = parseInt(line.replace('listening port:', '').trim(), 10);
        if (!isNaN(p)) listenPort = p;
      } else if (line.startsWith('peer:')) {
        if (currentRuntimePeer) {
          peerMap.set(currentRuntimePeer.publicKey, currentRuntimePeer);
        }
        const pubKey = line.replace('peer:', '').trim();
        currentRuntimePeer = {
          name: '',
          publicKey: pubKey,
          allowedIps: '',
        };
      } else if (currentRuntimePeer) {
        if (line.startsWith('endpoint:')) {
          currentRuntimePeer.endpoint = line.replace('endpoint:', '').trim();
        } else if (line.startsWith('allowed ips:')) {
          currentRuntimePeer.allowedIps = line.replace('allowed ips:', '').trim();
        } else if (line.startsWith('latest handshake:')) {
          const hs = line.replace('latest handshake:', '').trim();
          currentRuntimePeer.latestHandshake = hs;
          // Determine if handshake happened recently (< 3 minutes)
          if (hs && !hs.includes('day') && !hs.includes('hour')) {
            const minMatch = hs.match(/(\d+)\s*minute/);
            if (!minMatch || parseInt(minMatch[1] || '0', 10) < 3) {
              currentRuntimePeer.isActive = true;
            }
          }
        } else if (line.startsWith('transfer:')) {
          const parts = line.replace('transfer:', '').trim().split(',');
          if (parts[0]) currentRuntimePeer.transferRx = parts[0].trim();
          if (parts[1]) currentRuntimePeer.transferTx = parts[1].trim();
        }
      }
    } else {
      // Parsing /etc/wireguard/wg0.conf
      if (line.startsWith('### Client:') || line.startsWith('# Client:') || line.startsWith('# Friendly Name:')) {
        pendingClientName = line.replace(/^(###|#)\s*(Client:|Friendly Name:)\s*/i, '').trim();
        continue;
      }

      if (line.startsWith('Address =') || line.startsWith('Address=')) {
        serverAddress = line.slice(line.indexOf('=') + 1).trim() || serverAddress;
      } else if (line.startsWith('ListenPort =') || line.startsWith('ListenPort=')) {
        const p = parseInt(line.slice(line.indexOf('=') + 1).trim() || '', 10);
        if (!isNaN(p)) listenPort = p;
      } else if (line.startsWith('PrivateKey =') || line.startsWith('PrivateKey=')) {
        serverPrivateKey = line.slice(line.indexOf('=') + 1).trim();
      } else if (line.startsWith('PublicKey =') || line.startsWith('PublicKey=')) {
        const pubKey = line.slice(line.indexOf('=') + 1).trim();
        if (pubKey) {
          const existing = peerMap.get(pubKey) || {
            name: pendingClientName || `User-${peerMap.size + 1}`,
            publicKey: pubKey,
            allowedIps: '',
          };
          if (pendingClientName) existing.name = pendingClientName;
          peerMap.set(pubKey, existing);
          pendingClientName = '';
        }
      } else if (line.startsWith('AllowedIPs =') || line.startsWith('AllowedIPs=')) {
        const ips = line.slice(line.indexOf('=') + 1).trim();
        // Find the last peer in map and update allowedIps if needed
        const keys = Array.from(peerMap.keys());
        const lastKey = keys[keys.length - 1];
        if (lastKey && ips) {
          const p = peerMap.get(lastKey)!;
          if (!p.allowedIps) p.allowedIps = ips;
        }
      }
    }
  }

  if (currentRuntimePeer) {
    const existing = peerMap.get(currentRuntimePeer.publicKey);
    if (existing) {
      existing.endpoint = currentRuntimePeer.endpoint;
      existing.latestHandshake = currentRuntimePeer.latestHandshake;
      existing.transferRx = currentRuntimePeer.transferRx;
      existing.transferTx = currentRuntimePeer.transferTx;
      existing.isActive = currentRuntimePeer.isActive;
    } else {
      peerMap.set(currentRuntimePeer.publicKey, currentRuntimePeer);
    }
  }

  // Ensure every peer has a readable name
  const peers: WireguardPeer[] = Array.from(peerMap.values()).map((p, idx) => ({
    ...p,
    name: p.name || `User-${idx + 1} (${p.publicKey.substring(0, 6)}...)`,
  }));

  return {
    isInstalled,
    isActive,
    interfaceName,
    serverPublicKey,
    serverPrivateKey,
    serverAddress,
    listenPort,
    peers,
  };
}

/**
 * Calculate the next available IP in the subnet
 */
export function getNextAvailableIp(peers: WireguardPeer[], baseSubnet = '10.99.0'): string {
  const usedHosts = new Set<number>();
  usedHosts.add(1); // Server gateway IP is 1

  for (const peer of peers) {
    if (!peer.allowedIps) continue;
    const ips = peer.allowedIps.split(',');
    for (const ipStr of ips) {
      const match = ipStr.trim().match(/(\d+\.\d+\.\d+)\.(\d+)(?:\/\d+)?/);
      if (match && match[1] === baseSubnet) {
        const hostNum = parseInt(match[2] || '', 10);
        if (!isNaN(hostNum)) {
          usedHosts.add(hostNum);
        }
      }
    }
  }

  for (let h = 2; h < 255; h++) {
    if (!usedHosts.has(h)) {
      return `${baseSubnet}.${h}/32`;
    }
  }

  return `${baseSubnet}.254/32`;
}

/**
 * Generate client configuration file (.conf)
 */
export function generateClientConfigFile(opts: {
  name?: string;
  clientPrivateKey: string;
  clientAddress: string;
  dns?: string;
  serverPublicKey: string;
  serverEndpoint: string;
  allowedIps?: string;
  persistentKeepalive?: number;
}): string {
  const cleanAddress = opts.clientAddress.includes('/')
    ? opts.clientAddress
    : `${opts.clientAddress}/32`;

  const cleanAllowedIps = opts.allowedIps || '10.99.0.0/24';
  const cleanDns = opts.dns || '1.1.1.1, 8.8.8.8';
  const keepalive = opts.persistentKeepalive ?? 25;

  return [
    opts.name ? `# WireGuard Client: ${opts.name}` : '',
    '[Interface]',
    `PrivateKey = ${opts.clientPrivateKey}`,
    `Address = ${cleanAddress}`,
    `DNS = ${cleanDns}`,
    '',
    '[Peer]',
    `PublicKey = ${opts.serverPublicKey}`,
    `Endpoint = ${opts.serverEndpoint}`,
    `AllowedIPs = ${cleanAllowedIps}`,
    `PersistentKeepalive = ${keepalive}`,
  ].filter(Boolean).join('\n') + '\n';
}

/**
 * Script to install WireGuard and configure server wg0
 */
export function buildInstallWireguardScript(
  options: WireguardInstallOptions,
  useSudo = false,
  sudoPass?: string
): string {
  const sudo = formatSudoPrefix(useSudo, sudoPass);
  const serverAddress = options.serverAddress || '10.99.0.1/24';
  const listenPort = options.listenPort || 51820;

  return `
set -e
echo "=== 1. Memeriksa & Menginstal Paket WireGuard ==="
if which apt-get >/dev/null 2>&1; then
  ${sudo}DEBIAN_FRONTEND=noninteractive apt-get update -y
  ${sudo}DEBIAN_FRONTEND=noninteractive apt-get install -y wireguard wireguard-tools iptables iproute2
elif which dnf >/dev/null 2>&1; then
  ${sudo}dnf install -y epel-release || true
  ${sudo}dnf install -y wireguard-tools iptables iproute || true
elif which yum >/dev/null 2>&1; then
  ${sudo}yum install -y epel-release || true
  ${sudo}yum install -y wireguard-tools iptables iproute || true
elif which apk >/dev/null 2>&1; then
  ${sudo}apk add wireguard-tools iptables iproute2
fi

echo "=== 2. Mengaktifkan IP Forwarding Kernel ==="
${sudo}mkdir -p /etc/sysctl.d
echo "net.ipv4.ip_forward=1" | ${sudo}tee /etc/sysctl.d/99-wireguard.conf >/dev/null
${sudo}sysctl -p /etc/sysctl.d/99-wireguard.conf 2>/dev/null || ${sudo}sysctl -w net.ipv4.ip_forward=1 2>/dev/null || true

echo "=== 3. Menyiapkan Kunci Server ==="
${sudo}mkdir -p /etc/wireguard
${sudo}chmod 700 /etc/wireguard

SERVER_PRIV="${options.serverPrivateKey || ''}"
SERVER_PUB="${options.serverPublicKey || ''}"

if [ -z "$SERVER_PRIV" ] || [ -z "$SERVER_PUB" ]; then
  SERVER_PRIV=$(wg genkey)
  SERVER_PUB=$(echo "$SERVER_PRIV" | wg pubkey)
fi

echo "=== 4. Mendeteksi Default Network Interface ==="
DEF_IFACE=$(ip route show default 2>/dev/null | awk '{print $5}' | head -n1)
[ -z "$DEF_IFACE" ] && DEF_IFACE="eth0"
echo "Interface default: $DEF_IFACE"

echo "=== 5. Membuat Konfigurasi /etc/wireguard/wg0.conf ==="
cat << 'EOF' | ${sudo}tee /etc/wireguard/wg0.conf >/dev/null
[Interface]
Address = ${serverAddress}
ListenPort = ${listenPort}
PrivateKey = SERVER_PRIV_PLACEHOLDER
SaveConfig = false
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o DEF_IFACE_PLACEHOLDER -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o DEF_IFACE_PLACEHOLDER -j MASQUERADE
EOF

${sudo}sed -i "s|SERVER_PRIV_PLACEHOLDER|$SERVER_PRIV|g" /etc/wireguard/wg0.conf
${sudo}sed -i "s|DEF_IFACE_PLACEHOLDER|$DEF_IFACE|g" /etc/wireguard/wg0.conf
${sudo}chmod 600 /etc/wireguard/wg0.conf

echo "=== 6. Membuka Port Firewall UDP ==="
which ufw >/dev/null 2>&1 && ${sudo}ufw allow ${listenPort}/udp >/dev/null 2>&1 || true
which firewall-cmd >/dev/null 2>&1 && (${sudo}firewall-cmd --add-port=${listenPort}/udp --permanent >/dev/null 2>&1 ; ${sudo}firewall-cmd --reload >/dev/null 2>&1) || true

echo "=== 7. Mengaktifkan Service WireGuard wg0 ==="
${sudo}systemctl stop wg-quick@wg0 2>/dev/null || ${sudo}wg-quick down wg0 2>/dev/null || true
${sudo}systemctl enable --now wg-quick@wg0 2>/dev/null || ${sudo}wg-quick up wg0 2>/dev/null || true

echo "WG_INSTALL_SUCCESS:SERVER_PUBKEY=$SERVER_PUB"
`.trim();
}

/**
 * Command to add a new user / peer
 */
export function buildAddPeerCommand(
  opts: WireguardAddPeerOptions,
  useSudo = false,
  sudoPass?: string
): string {
  const sudo = formatSudoPrefix(useSudo, sudoPass);
  const safeName = opts.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'user';
  const clientIp = opts.clientIp.includes('/') ? opts.clientIp : `${opts.clientIp}/32`;

  const privParam = opts.clientPrivateKey ? `C_PRIV="${opts.clientPrivateKey}"` : 'C_PRIV=$(wg genkey)';
  const pubParam = opts.clientPublicKey ? `C_PUB="${opts.clientPublicKey}"` : 'C_PUB=$(echo "$C_PRIV" | wg pubkey)';

  return `
set -e
${privParam}
${pubParam}

# Tambahkan peer ke file konfigurasi
cat << 'EOF' | ${sudo}tee -a /etc/wireguard/wg0.conf >/dev/null

### Client: ${safeName}
[Peer]
PublicKey = CLIENT_PUB_PLACEHOLDER
AllowedIPs = ${clientIp}
EOF

${sudo}sed -i "s|CLIENT_PUB_PLACEHOLDER|$C_PUB|g" /etc/wireguard/wg0.conf
${sudo}chmod 600 /etc/wireguard/wg0.conf

# Daftarkan langsung ke interface aktif
${sudo}wg set wg0 peer "$C_PUB" allowed-ips "${clientIp}" 2>/dev/null || true

echo "WG_ADD_PEER_SUCCESS:NAME=${safeName}|PRIV=$C_PRIV|PUB=$C_PUB|IP=${clientIp}"
`.trim();
}

/**
 * Parse output from buildAddPeerCommand
 */
export function parseAddPeerOutput(output: string): {
  name: string;
  clientPrivateKey: string;
  clientPublicKey: string;
  clientIp: string;
} | null {
  const line = output.split('\n').find(l => l.includes('WG_ADD_PEER_SUCCESS:'));
  if (!line) return null;

  const raw = line.replace('WG_ADD_PEER_SUCCESS:', '').trim();
  const parts = raw.split('|');
  const result: Record<string, string> = {};

  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k && v !== undefined) {
      result[k.trim()] = v.trim();
    }
  }

  if (result.PUB && result.IP) {
    return {
      name: result.NAME || 'user',
      clientPrivateKey: result.PRIV || '',
      clientPublicKey: result.PUB,
      clientIp: result.IP,
    };
  }

  return null;
}

/**
 * Command to delete a peer from wireguard runtime and /etc/wireguard/wg0.conf
 */
export function buildDeletePeerCommand(
  publicKey: string,
  useSudo = false,
  sudoPass?: string
): string {
  const sudo = formatSudoPrefix(useSudo, sudoPass);

  return `
# Hapus peer dari interface runtime
${sudo}wg set wg0 peer "${publicKey}" remove 2>/dev/null || true

# Hapus blok peer dari file konfigurasi menggunakan awk
${sudo}awk -v key="${publicKey}" '
  BEGIN { RS = ""; ORS = "\\n\\n" }
  index($0, key) == 0 { print }
' /etc/wireguard/wg0.conf | ${sudo}tee /etc/wireguard/wg0.conf.tmp >/dev/null

${sudo}mv /etc/wireguard/wg0.conf.tmp /etc/wireguard/wg0.conf
${sudo}chmod 600 /etc/wireguard/wg0.conf
echo "WG_DELETE_PEER_SUCCESS"
`.trim();
}

/**
 * Command to control WireGuard service (start, stop, restart)
 */
export function buildServiceControlCommand(
  action: 'start' | 'stop' | 'restart',
  useSudo = false,
  sudoPass?: string
): string {
  const sudo = formatSudoPrefix(useSudo, sudoPass);
  if (action === 'stop') {
    return `${sudo}systemctl stop wg-quick@wg0 2>/dev/null || ${sudo}wg-quick down wg0 2>/dev/null || true ; echo "WG_STOPPED"`;
  }
  if (action === 'start') {
    return `${sudo}systemctl start wg-quick@wg0 2>/dev/null || ${sudo}wg-quick up wg0 2>/dev/null || true ; echo "WG_STARTED"`;
  }
  return `${sudo}systemctl restart wg-quick@wg0 2>/dev/null || (${sudo}wg-quick down wg0 2>/dev/null ; ${sudo}wg-quick up wg0 2>/dev/null) || true ; echo "WG_RESTARTED"`;
}

/**
 * Command to completely remove WireGuard configuration
 */
export function buildUninstallWireguardScript(useSudo = false, sudoPass?: string): string {
  const sudo = formatSudoPrefix(useSudo, sudoPass);
  return `${sudo}systemctl stop wg-quick@wg0 2>/dev/null || ${sudo}wg-quick down wg0 2>/dev/null || true ; ${sudo}systemctl disable wg-quick@wg0 2>/dev/null || true ; ${sudo}rm -f /etc/wireguard/wg0.conf /etc/sysctl.d/99-wireguard.conf ; echo "WG_UNINSTALLED_OK"`;
}

/**
 * Command to fetch WireGuard systemd journal and kernel logs
 */
export function buildWireguardLogsCommand(
  lines = 100,
  useSudo = false,
  sudoPass?: string
): string {
  const sudo = formatSudoPrefix(useSudo, sudoPass);
  return [
    'echo "=== SYSTEMD JOURNAL (wg-quick@wg0) ==="',
    `${sudo}journalctl -u wg-quick@wg0 -n ${lines} --no-pager 2>/dev/null || echo "(Tidak ada journal systemd)"`,
    'echo ""',
    'echo "=== KERNEL DMESG (WireGuard) ==="',
    `${sudo}dmesg -T 2>/dev/null | grep -i wireguard | tail -n 50 || ${sudo}dmesg 2>/dev/null | grep -i wireguard | tail -n 50 || echo "(Tidak ada log dmesg)"`,
    'echo ""',
    'echo "=== RUNTIME DUMP (wg show wg0) ==="',
    `${sudo}wg show wg0 2>/dev/null || echo "(Interface wg0 tidak aktif)"`,
  ].join(' ; ');
}

/**
 * Command to fetch real-time activity and kernel logs for a specific peer
 */
export function buildPeerLogsCommand(
  publicKey: string,
  useSudo = false,
  sudoPass?: string
): string {
  const sudo = formatSudoPrefix(useSudo, sudoPass);
  const shortKey = publicKey.slice(0, 10);
  return [
    'echo "=== STATUS RUNTIME PEER (wg show wg0) ==="',
    `${sudo}wg show wg0 2>/dev/null | grep -A 5 -F "${publicKey}" || echo "(Peer belum pernah mengirim handshake/traffic)"`,
    'echo ""',
    'echo "=== LOG KERNEL / DMESG TERKAIT KEY INI ==="',
    `(${sudo}dmesg -T 2>/dev/null || ${sudo}dmesg 2>/dev/null) | grep -i -F "${shortKey}" | tail -n 30 || echo "(Tidak ada log kernel dmesg spesifik key ini)"`,
    'echo ""',
    'echo "=== STATISTIK TRANSFER PACKET (IP ROUTE / CONNTRACK) ==="',
    `(${sudo}conntrack -L -p udp --dport 51820 2>/dev/null || ${sudo}ss -u -a -p 2>/dev/null | grep 51820) | tail -n 10 || echo "(Koneksi UDP aktif tidak terdeteksi di conntrack)"`,
  ].join(' ; ');
}

/**
 * Enable dynamic debug for in-depth packet/handshake logging in dmesg
 */
export function buildEnableDynamicDebugCommand(useSudo = false, sudoPass?: string): string {
  const sudo = formatSudoPrefix(useSudo, sudoPass);
  return `echo "module wireguard +p" | ${sudo}tee /sys/kernel/debug/dynamic_debug/control 2>/dev/null || true ; echo "DYNAMIC_DEBUG_OK"`;
}

/**
 * Command to follow live log stream for WireGuard service
 */
export function buildWireguardLiveStreamCommand(
  useSudo = false,
  sudoPass?: string
): string {
  const sudo = formatSudoPrefix(useSudo, sudoPass);
  return `${sudo}journalctl -fu wg-quick@wg0 -n 50 --no-pager`;
}

/**
 * Command to follow live kernel packet/handshake events for a specific peer
 */
export function buildPeerLiveStreamCommand(
  publicKey: string,
  useSudo = false,
  sudoPass?: string
): string {
  const sudo = formatSudoPrefix(useSudo, sudoPass);
  const shortKey = publicKey.slice(0, 10);
  return `(echo "module wireguard +p" | ${sudo}tee /sys/kernel/debug/dynamic_debug/control 2>/dev/null || true) ; (${sudo}dmesg -w -T 2>/dev/null || ${sudo}dmesg -w 2>/dev/null || ${sudo}journalctl -kf 2>/dev/null) | grep --line-buffered -i -F "${shortKey}"`;
}
