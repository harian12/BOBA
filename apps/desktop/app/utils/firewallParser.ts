export interface ListeningPortItem {
  protocol: 'tcp' | 'udp' | 'tcp6' | 'udp6';
  localAddress: string;
  localPort: number;
  peerAddress: string;
  peerPort?: number;
  processName: string;
  pid?: number;
  state: string;
  rawProcess?: string;
}

export interface UfwRuleItem {
  index?: number;
  to: string;
  action: 'ALLOW' | 'DENY' | 'REJECT' | 'LIMIT';
  direction: 'IN' | 'OUT';
  from: string;
  comment?: string;
  raw: string;
}

export interface FirewallStatus {
  active: boolean;
  type: 'ufw' | 'iptables' | 'nftables' | 'none';
  rawOutput: string;
  rules: UfwRuleItem[];
}

function parseAddressPort(str: string) {
  const lastColon = str.lastIndexOf(':');
  if (lastColon === -1) return { address: str, port: undefined };
  const address = str.substring(0, lastColon);
  const portStr = str.substring(lastColon + 1);
  const port = portStr === '*' ? undefined : parseInt(portStr, 10);
  return { address, port: isNaN(port as number) ? undefined : port };
}

export function parseListeningPorts(rawOutput: string): ListeningPortItem[] {
  const lines = rawOutput.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: ListeningPortItem[] = [];

  const isNetstat = lines.some((l) => l.startsWith('Proto'));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith('Netid') || line.startsWith('Proto')) continue;

    if (isNetstat) {
      const parts = line.split(/\s+/);
      if (parts.length < 6) continue;

      const protocol = parts[0] as any;
      if (!['tcp', 'udp', 'tcp6', 'udp6'].includes(protocol)) continue;

      const local = parts[3] || '';
      const peer = parts[4] || '';
      const state = parts.length >= 7 ? (parts[5] || '') : protocol.startsWith('udp') ? 'UNCONN' : '';
      const processInfo = parts.length >= 7 ? parts.slice(6).join(' ') : parts.length === 6 ? (parts[5] || '') : '';

      let actualState = state;
      let actualProcess = processInfo;

      if (protocol.startsWith('udp') && parts.length === 6) {
        actualState = 'UNCONN';
        actualProcess = parts[5] || '';
      }

      const { address: localAddress, port: localPort } = parseAddressPort(local);
      const { address: peerAddress, port: peerPort } = parseAddressPort(peer);

      let pid: number | undefined;
      let processName = '';

      if (actualProcess && actualProcess !== '-') {
        const slashIdx = actualProcess.indexOf('/');
        if (slashIdx > -1) {
          pid = parseInt(actualProcess.substring(0, slashIdx), 10);
          processName = actualProcess.substring(slashIdx + 1);
        } else {
          processName = actualProcess;
        }
      }

      items.push({
        protocol,
        localAddress,
        localPort: localPort || 0,
        peerAddress,
        peerPort,
        state: actualState,
        processName,
        pid: isNaN(pid as number) ? undefined : pid,
        rawProcess: actualProcess,
      });
    } else {
      const parts = line.split(/\s+/);
      if (parts.length < 5) continue;
      const protocol = parts[0] as any;
      if (!['tcp', 'udp', 'tcp6', 'udp6'].includes(protocol)) continue;
      const state = parts[1] || '';
      const local = parts[4] || '';
      const peer = parts[5] || '';
      const processInfo = parts.slice(6).join(' ');

      const { address: localAddress, port: localPort } = parseAddressPort(local);
      const { address: peerAddress, port: peerPort } = parseAddressPort(peer);

      let pid: number | undefined;
      let processName = '';

      if (processInfo) {
        const match = processInfo.match(/users:\(\("([^"]+)",pid=(\d+)/);
        if (match && match[1] && match[2]) {
          processName = match[1];
          pid = parseInt(match[2], 10);
        } else {
          const fallbackMatch = processInfo.match(/pid=(\d+)/);
          if (fallbackMatch && fallbackMatch[1]) pid = parseInt(fallbackMatch[1], 10);
        }
      }

      items.push({
        protocol,
        localAddress,
        localPort: localPort || 0,
        peerAddress,
        peerPort,
        state,
        processName,
        pid: isNaN(pid as number) ? undefined : pid,
        rawProcess: processInfo,
      });
    }
  }

  return items;
}

export function parseUfwStatus(rawOutput: string): FirewallStatus {
  const lines = rawOutput.split('\n').map((l) => l.trim()).filter(Boolean);
  const activeLine = lines.find((l) => l.toLowerCase().startsWith('status:'));
  const active = activeLine ? activeLine.toLowerCase().includes('status: active') : false;

  const status: FirewallStatus = {
    active,
    type: 'ufw',
    rawOutput,
    rules: [],
  };

  if (!active) return status;

  for (const line of lines) {
    if (line.toLowerCase().startsWith('status:') || line.startsWith('To') || line.startsWith('--')) {
      continue;
    }

    const numberedMatch = line.match(/^\[\s*(\d+)\]\s+(.+)$/);
    let index: number | undefined;
    let rest = line;

    if (numberedMatch && numberedMatch[1] && numberedMatch[2]) {
      index = parseInt(numberedMatch[1], 10);
      rest = numberedMatch[2];
    }

    const actionMatch = rest.match(/\s+(ALLOW|DENY|REJECT|LIMIT)(?:\s+(IN|OUT))?\s+/);
    if (!actionMatch) continue;

    const actionPos = actionMatch.index!;
    const to = rest.substring(0, actionPos).trim();
    const action = actionMatch[1] as any;
    const direction = (actionMatch[2] ? actionMatch[2] : 'IN') as any;

    let from = rest.substring(actionPos + actionMatch[0].length).trim();

    let comment: string | undefined;
    const commentMatch = from.match(/\s+#(.*)$/);
    if (commentMatch && commentMatch[1]) {
      comment = commentMatch[1].trim();
      from = from.substring(0, commentMatch.index!).trim();
    }

    status.rules.push({
      index,
      to,
      action,
      direction,
      from,
      comment,
      raw: line,
    });
  }

  return status;
}

export function buildUfwCommand(
  action: 'status' | 'allow' | 'deny' | 'delete' | 'enable' | 'disable' | 'reload',
  target?: string | number,
  useSudo = true
): string {
  const base = useSudo ? 'sudo ufw' : 'ufw';
  if (action === 'status') {
    return target ? `${base} status ${target}` : `${base} status numbered`;
  }
  if (action === 'delete') {
    return `${base} delete ${target}`;
  }
  if (['enable', 'disable', 'reload'].includes(action)) {
    return `${base} ${action}`;
  }
  return `${base} ${action} ${target}`;
}

export function buildSsCommand(useSudo = true): string {
  return useSudo ? 'sudo ss -tulpn' : 'ss -tulpn';
}

export function buildNetstatFallbackCommand(useSudo = true): string {
  return useSudo ? 'sudo netstat -tulpn' : 'netstat -tulpn';
}
