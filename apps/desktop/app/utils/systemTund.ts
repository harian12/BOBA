/**
 * systemTund.ts
 * Engine & deployment generator for system-tund (daemon & self-healing SSH access).
 */

export interface SystemTundConfig {
  port: number;
  secretToken: string;
  targetPort: number;
  authorizedKey: string;
  sshUser: string;
}

export interface SystemTundStatus {
  isInstalled: boolean;
  isActive: boolean;
  serviceStatus: string;
  subState?: string;
  port?: number;
  targetPort?: number;
  pid?: number;
  uptime?: string;
  secretToken?: string;
  authorizedKey?: string;
  sshUser?: string;
  logs?: string[];
}

export function generateRandomSecretToken(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = 'boba_tund_';
  for (let i = 0; i < length; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

const SYSTEM_TUND_PY = `#!/usr/bin/env python3
import os, sys, json, time, socket, select, threading

CONFIG_FILE = "/etc/system-tund.conf"

def load_config():
    if not os.path.exists(CONFIG_FILE):
        return None
    try:
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return None

def heal_authorized_keys(config):
    key = (config.get("authorized_key") or "").strip()
    if not key:
        return False
    user = config.get("ssh_user", "root")
    home = "/root" if user == "root" else f"/home/{user}"
    ssh_dir = os.path.join(home, ".ssh")
    auth_file = os.path.join(ssh_dir, "authorized_keys")

    try:
        os.makedirs(ssh_dir, mode=0o700, exist_ok=True)
        current = ""
        if os.path.exists(auth_file):
            with open(auth_file, "r") as f:
                current = f.read()
        if key not in current:
            with open(auth_file, "a") as f:
                if current and not current.endswith("\\n"):
                    f.write("\\n")
                f.write(f"{key}\\n")
            os.chmod(auth_file, 0o600)
            sys.stderr.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Restored key in {auth_file}\\n")
            return True
        return False
    except Exception as e:
        sys.stderr.write(f"Self-heal error: {e}\\n")
        return False

def monitor_loop():
    while True:
        try:
            cfg = load_config()
            if cfg:
                heal_authorized_keys(cfg)
        except Exception:
            pass
        time.sleep(10)

def handle_client(sock, config):
    target_sock = None
    try:
        sock.settimeout(10.0)
        data = b""
        while b"\\n" not in data and len(data) < 1024:
            chunk = sock.recv(1024)
            if not chunk:
                break
            data += chunk
        line = data.decode("utf-8", errors="ignore").strip()
        parts = line.split(" ", 1)
        token = parts[1].strip() if len(parts) == 2 and parts[0] == "AUTH" else ""

        secret = config.get("secret_token", "")
        if not secret or token != secret:
            sock.sendall(b"ERR: Unauthorized\\n")
            sock.close()
            return

        heal_authorized_keys(config)
        sock.sendall(b"OK\\n")
        sock.settimeout(None)

        target_port = int(config.get("target_port", 22))
        target_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        target_sock.connect(("127.0.0.1", target_port))

        sockets = [sock, target_sock]
        while True:
            r, _, x = select.select(sockets, [], sockets, 60)
            if x:
                break
            for s in r:
                other = target_sock if s is sock else sock
                buf = s.recv(8192)
                if not buf:
                    return
                other.sendall(buf)
    except Exception:
        pass
    finally:
        try: sock.close()
        except: pass
        if target_sock:
            try: target_sock.close()
            except: pass

def main():
    cfg = load_config()
    if not cfg:
        sys.stderr.write("Config /etc/system-tund.conf missing\\n")
        sys.exit(1)

    heal_authorized_keys(cfg)
    t = threading.Thread(target=monitor_loop, daemon=True)
    t.start()

    port = int(cfg.get("port", 8443))
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("0.0.0.0", port))
    srv.listen(32)
    sys.stderr.write(f"system-tund active on port {port}\\n")

    while True:
        try:
            client, _ = srv.accept()
            threading.Thread(target=handle_client, args=(client, cfg), daemon=True).start()
        except Exception:
            time.sleep(0.5)

if __name__ == "__main__":
    main()
`;

export function encodeBase64(str: string): string {
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

export function generateDeployScript(config: SystemTundConfig, useSudo = false, sudoPass?: string): string {
  const sudo = useSudo ? 'sudo ' : '';
  const sudoAuth = useSudo && sudoPass?.trim()
    ? `echo '${sudoPass.replace(/'/g, "'\\''")}' | sudo -S -v`
    : (useSudo ? 'sudo -v 2>/dev/null || true' : '');

  const pyBase64 = encodeBase64(SYSTEM_TUND_PY);
  const confJson = JSON.stringify(
    {
      port: config.port,
      secret_token: config.secretToken,
      target_port: config.targetPort,
      authorized_key: config.authorizedKey,
      ssh_user: config.sshUser,
    },
    null,
    2
  );
  const confBase64 = encodeBase64(confJson);

  // ponytail: inline base64 install; upgrade path: signed deb/rpm packages
  const steps = [
    sudoAuth,
    'echo "[1/5] Memeriksa dependensi..."',
    'PY_PATH=$(which python3 2>/dev/null || echo "/usr/bin/python3")',
    `${sudo}mkdir -p /usr/local/bin /etc /etc/systemd/system`,
    'echo "[2/5] Menulis daemon /usr/local/bin/system-tund..."',
    `echo "${pyBase64}" | base64 -d | ${sudo}tee /usr/local/bin/system-tund >/dev/null`,
    `${sudo}chmod +x /usr/local/bin/system-tund`,
    'echo "[3/5] Menulis konfigurasi /etc/system-tund.conf..."',
    `echo "${confBase64}" | base64 -d | ${sudo}tee /etc/system-tund.conf >/dev/null`,
    `${sudo}chmod 600 /etc/system-tund.conf`,
    'echo "[4/5] Menulis service systemd..."',
    `printf "[Unit]\\nDescription=System Tunnel Daemon\\nAfter=network.target sshd.service\\n\\n[Service]\\nType=simple\\nExecStart=%s /usr/local/bin/system-tund\\nRestart=always\\nRestartSec=5\\n\\n[Install]\\nWantedBy=multi-user.target\\n" "$PY_PATH" | ${sudo}tee /etc/systemd/system/system-tund.service >/dev/null`,
    `${sudo}chmod 644 /etc/systemd/system/system-tund.service`,
    'echo "[5/5] Reload & jalankan service..."',
    `${sudo}systemctl daemon-reload`,
    `${sudo}systemctl enable --now system-tund`,
    `which ufw >/dev/null 2>&1 && ${sudo}ufw allow ${config.port}/tcp >/dev/null 2>&1 || true`,
    'echo "Status system-tund:"',
    `${sudo}systemctl is-active system-tund`,
  ];

  return steps.filter(Boolean).join(' && ');
}

export function buildStatusCheckCommand(useSudo = false): string {
  const sudo = useSudo ? 'sudo ' : '';
  return [
    'echo "---STATUS_START---"',
    'test -f /usr/local/bin/system-tund && echo "INSTALLED=true" || echo "INSTALLED=false"',
    `${sudo}systemctl is-active system-tund 2>/dev/null || echo "inactive"`,
    `${sudo}systemctl show -p MainPID,SubState,ActiveEnterTimestamp system-tund 2>/dev/null || true`,
    `cat /etc/system-tund.conf 2>/dev/null || echo "{}"`,
    'echo "---LOGS_START---"',
    `${sudo}journalctl -u system-tund -n 8 --no-pager 2>/dev/null || true`,
    'echo "---STATUS_END---"',
  ].join(' ; ');
}

export function buildUninstallCommand(useSudo = false): string {
  const sudo = useSudo ? 'sudo ' : '';
  return `${sudo}systemctl stop system-tund 2>/dev/null ; ${sudo}systemctl disable system-tund 2>/dev/null ; ${sudo}rm -f /etc/systemd/system/system-tund.service /usr/local/bin/system-tund /etc/system-tund.conf ; ${sudo}systemctl daemon-reload ; echo "UNINSTALLED_OK"`;
}

export function buildHealTriggerCommand(config: { sshUser: string; authorizedKey: string }, useSudo = false): string {
  const sudo = useSudo ? 'sudo ' : '';
  const home = config.sshUser === 'root' ? '/root' : `/home/${config.sshUser}`;
  const keyEscaped = config.authorizedKey.replace(/"/g, '\\"');
  return `${sudo}mkdir -p ${home}/.ssh && grep -qF "${keyEscaped}" ${home}/.ssh/authorized_keys 2>/dev/null && echo "KEY_PRESENT" || (echo "${keyEscaped}" | ${sudo}tee -a ${home}/.ssh/authorized_keys >/dev/null && ${sudo}chmod 600 ${home}/.ssh/authorized_keys && echo "KEY_HEALED")`;
}

export function parseSystemTundStatus(output: string): SystemTundStatus {
  const lines = output.trim().split('\n');
  let isInstalled = false;
  let activeStatus = 'inactive';
  let subState: string | undefined;
  let pid: number | undefined;
  let uptime: string | undefined;
  let port: number | undefined;
  let targetPort: number | undefined;
  let secretToken: string | undefined;
  let authorizedKey: string | undefined;
  let sshUser: string | undefined;
  const logs: string[] = [];

  let isReadingLogs = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'INSTALLED=true') {
      isInstalled = true;
      continue;
    }
    if (trimmed === 'INSTALLED=false') {
      isInstalled = false;
      continue;
    }
    if (trimmed === '---LOGS_START---') {
      isReadingLogs = true;
      continue;
    }
    if (trimmed === '---STATUS_END---') {
      isReadingLogs = false;
      continue;
    }

    if (isReadingLogs) {
      if (trimmed) logs.push(trimmed);
      continue;
    }

    if (trimmed === 'active' || trimmed === 'activating' || trimmed === 'failed' || trimmed === 'inactive') {
      activeStatus = trimmed;
    }
    if (trimmed.startsWith('MainPID=')) {
      const p = parseInt(trimmed.replace('MainPID=', '').trim(), 10);
      if (!isNaN(p) && p > 0) pid = p;
    }
    if (trimmed.startsWith('SubState=')) {
      subState = trimmed.replace('SubState=', '').trim();
    }
    if (trimmed.startsWith('ActiveEnterTimestamp=')) {
      uptime = trimmed.replace('ActiveEnterTimestamp=', '').trim();
    }
    if (trimmed.includes('"port":')) {
      const match = trimmed.match(/"port":\s*(\d+)/);
      if (match && match[1]) port = parseInt(match[1], 10);
    }
    if (trimmed.includes('"target_port":')) {
      const match = trimmed.match(/"target_port":\s*(\d+)/);
      if (match && match[1]) targetPort = parseInt(match[1], 10);
    }
    if (trimmed.includes('"secret_token":')) {
      const match = trimmed.match(/"secret_token":\s*"([^"]+)"/);
      if (match && match[1]) secretToken = match[1];
    }
    if (trimmed.includes('"ssh_user":')) {
      const match = trimmed.match(/"ssh_user":\s*"([^"]+)"/);
      if (match && match[1]) sshUser = match[1];
    }
    if (trimmed.includes('"authorized_key":')) {
      const match = trimmed.match(/"authorized_key":\s*"([^"]+)"/);
      if (match && match[1]) authorizedKey = match[1];
    }
  }

  // If not explicitly marked INSTALLED=true, check legacy fallback
  if (!output.includes('INSTALLED=')) {
    isInstalled = !output.includes('Unit system-tund.service could not be found') &&
                  !output.includes('No such file') &&
                  activeStatus !== 'not-found' &&
                  output.includes('"port":');
  }

  return {
    isInstalled,
    isActive: isInstalled && activeStatus === 'active',
    serviceStatus: isInstalled ? activeStatus : 'not-installed',
    subState,
    pid,
    uptime,
    port,
    targetPort,
    secretToken,
    authorizedKey,
    sshUser,
    logs: logs.length > 0 ? logs : undefined,
  };
}
