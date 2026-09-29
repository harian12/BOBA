export type AppKind = 'pm2' | 'docker' | 'systemd' | 'webroot';

export interface AppInfo {
  kind: AppKind;
  name: string;
  detail: string;
  status: string;
  /** PM2 only: the real log paths reported by the daemon. */
  outLog?: string;
  errLog?: string;
  /** Webroot only: the framework log file, when one was found on disk. */
  logFile?: string;
  /** Webroot only: absolute path of the application directory. */
  path?: string;
}

export type LogTargetKind = AppKind | 'file';

export interface LogTarget {
  kind: LogTargetKind;
  name: string;
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\[[0-9;?]*[ -/]*[@-~]/g;

/**
 * Clean up raw command output before we try to read it:
 * SSH exec channels hand back CRLF, and tools frequently colourise their
 * output or print update notices on stdout alongside the data.
 */
function normalize(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(ANSI_RE, '')
    .replace(/\][^]*/g, '')
    .trim();
}

function section(raw: string, label: string): string {
  const start = raw.indexOf(`---${label}---`);
  if (start === -1) return '';
  const from = start + label.length + 6;
  const end = raw.indexOf('---END---', from);
  if (end === -1) return '';
  return normalize(raw.slice(from, end));
}

/**
 * Shape of `pm2 jlist` output. It changed between PM2 majors, so we sniff the
 * shape first and then hand the data to a parser written for that shape.
 *
 *  - `array`  PM2 3/4: one JSON array, possibly pretty-printed across lines
 *  - `jsonl`  PM2 5+:  one JSON object per line (JSON Lines)
 *  - `single` exactly one object
 *  - `empty`  no data at all
 *  - `unknown` there is data-ish output we could not recognise
 */
export type Pm2Format = 'array' | 'jsonl' | 'single' | 'empty' | 'unknown';

function isJsonObject(line: string): boolean {
  if (!line.startsWith('{') || !line.endsWith('}')) return false;
  try {
    const v = JSON.parse(line);
    return !!v && typeof v === 'object' && !Array.isArray(v);
  } catch {
    return false;
  }
}

export function detectPm2Format(block: string): Pm2Format {
  const text = normalize(block);
  if (!text) return 'empty';

  // Array: find the outermost [ ... ] span and confirm it really parses. We must
  // not decide on the first character alone, because PM2 notices such as
  // "[PM2] Updatable modules available" also start with a bracket.
  const open = text.indexOf('[');
  if (open !== -1) {
    const close = text.lastIndexOf(']');
    if (close > open) {
      try {
        const parsed = JSON.parse(text.slice(open, close + 1));
        if (Array.isArray(parsed)) return 'array';
      } catch {
        // Fall through: a bracket that is not a JSON array.
      }
    }
  }

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return 'empty';

  if (lines.length === 1) {
    return isJsonObject(lines[0] as string) ? 'single' : 'unknown';
  }

  // JSON Lines: every single line must stand alone as an object.
  return lines.every(isJsonObject) ? 'jsonl' : 'unknown';
}

function toAppInfo(record: any): AppInfo | null {
  if (!record || typeof record !== 'object' || !record.name) return null;
  const env = record.pm2_env || {};
  const app: AppInfo = {
    kind: 'pm2',
    name: String(record.name),
    detail: String(env.pm_exec_path || env.pm_cwd || ''),
    status: String(env.status || 'unknown')
  };
  // `pm_out_log_path` is authoritative: ecosystem files may rename or relocate
  // the logs, so guessing ~/.pm2/logs/<name>-out.log is often simply wrong.
  if (env.pm_out_log_path) app.outLog = String(env.pm_out_log_path);
  if (env.pm_err_log_path) app.errLog = String(env.pm_err_log_path);
  return app;
}

function parsePm2(block: string): AppInfo[] {
  const format = detectPm2Format(block);
  const text = normalize(block);

  if (format === 'empty') return [];

  if (format === 'array') {
    const open = text.indexOf('[');
    const close = text.lastIndexOf(']');
    if (open === -1 || close <= open) return [];
    try {
      const parsed = JSON.parse(text.slice(open, close + 1));
      if (!Array.isArray(parsed)) return [];
      return parsed.map(toAppInfo).filter((x): x is AppInfo => x !== null);
    } catch {
      // A truncated or interleaved array is not recoverable here.
      return [];
    }
  }

  if (format === 'single') {
    try {
      const info = toAppInfo(JSON.parse(text));
      return info ? [info] : [];
    } catch {
      return [];
    }
  }

  if (format === 'jsonl') {
    const out: AppInfo[] = [];
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const info = toAppInfo(JSON.parse(trimmed));
        if (info) out.push(info);
      } catch {
        // Skip a single bad record rather than losing the whole list.
      }
    }
    return out;
  }

  // `unknown`: salvage whatever lines do parse, so a stray notice line does not
  // hide real applications.
  const salvaged: AppInfo[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!isJsonObject(trimmed)) continue;
    try {
      const info = toAppInfo(JSON.parse(trimmed));
      if (info) salvaged.push(info);
    } catch {
      // ignore
    }
  }
  return salvaged;
}

function parseDocker(block: string): AppInfo[] {
  if (!block.trim()) return [];
  const out: AppInfo[] = [];
  for (const line of block.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [name = '', image = '', status = ''] = trimmed.split('|');
    if (!name) continue;
    out.push({ kind: 'docker', name, detail: image, status });
  }
  return out;
}

function parseSystemd(block: string): AppInfo[] {
  if (!block.trim()) return [];
  const out: AppInfo[] = [];
  for (const line of block.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [unit = '', active = '', sub = ''] = trimmed.split('~');
    if (!unit) continue;
    out.push({ kind: 'systemd', name: unit, detail: sub || active, status: active || 'unknown' });
  }
  return out;
}

export function parseRunningApps(rawOutput: string): AppInfo[] {
  if (!rawOutput) return [];
  return [
    ...parsePm2(section(rawOutput, 'PM2')),
    ...parseDocker(section(rawOutput, 'DOCKER')),
    ...parseSystemd(section(rawOutput, 'SYSTEMD')),
    ...parseWebroot(section(rawOutput, 'WEBROOT'))
  ];
}

/**
 * Applications discovered by scanning document roots rather than a process
 * manager. A Laravel or WordPress install has no PM2 process and no systemd
 * unit, so without this it simply does not exist as far as BOBA is concerned.
 */
export function parseWebroot(block: string): AppInfo[] {
  const out: AppInfo[] = [];
  for (const line of block.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [name = '', path = '', stack = '', log = ''] = trimmed.split('|');
    if (!name || !path) continue;
    out.push({
      kind: 'webroot',
      name,
      detail: stack,
      status: 'deployed',
      path,
      logFile: log || undefined
    });
  }
  return out;
}

export interface SourceAvailability {
  /** `null` means the backend did not report this source (older binary). */
  pm2: boolean | null;
  docker: boolean | null;
  systemd: boolean | null;
  webroot: boolean | null;
  /** Docker answered, but only via passwordless sudo. */
  dockerNeedsSudo: boolean;
}

/**
 * Which runtimes actually responded. Lets the UI explain an empty group
 * instead of silently showing nothing. A `null` value means the running
 * backend is too old to report availability, so we must not claim anything.
 */
export function parseSourceAvailability(rawOutput: string): SourceAvailability {
  if (!rawOutput) {
    return { pm2: null, docker: null, systemd: null, webroot: null, dockerNeedsSudo: false };
  }

  const pm2Raw = section(rawOutput, 'PM2FOUND').trim().toLowerCase();
  const dockerRaw = section(rawOutput, 'DOCKER');
  const systemdRaw = section(rawOutput, 'SYSTEMD');
  const hasMarkers = rawOutput.includes('---PM2FOUND---');

  // Reading a container log needs the same escalation the scan needed.
  const dockerNeedsSudo = section(rawOutput, 'DOCKERSUDO').trim().toLowerCase() === 'yes';

  if (!hasMarkers) {
    return {
      pm2: null,
      docker: rawOutput.includes('---DOCKER---') ? Boolean(dockerRaw.trim()) : null,
      systemd: rawOutput.includes('---SYSTEMD---') ? Boolean(systemdRaw.trim()) : null,
      webroot: rawOutput.includes('---WEBROOT---') ? Boolean(section(rawOutput, 'WEBROOT').trim()) : null,
      dockerNeedsSudo
    };
  }

  return {
    pm2: pm2Raw === 'yes',
    docker: Boolean(dockerRaw.trim()),
    systemd: Boolean(systemdRaw.trim()),
    webroot: Boolean(section(rawOutput, 'WEBROOT').trim()),
    dockerNeedsSudo
  };
}

/** Quote a path for safe use inside a single-quoted shell argument. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function serviceUnit(name: string): string {
  // systemd units are reported with a .service suffix already; leave as-is.
  return name.replace(/\.service$/, '');
}

export function buildLogCommand(target: LogTarget, lines: number, follow: boolean): string {
  const n = Math.max(1, Math.floor(lines));
  const f = follow ? ' -f' : '';
  switch (target.kind) {
    case 'docker':
      return `docker logs --tail ${n}${f} ${shellQuote(target.name)}`;
    case 'systemd':
      return `journalctl -u ${shellQuote(serviceUnit(target.name))} -n ${n}${f} --no-pager -o short-iso`;
    case 'pm2': {
      const path = shellArgForPath(target.name);
      return `tail -n ${n}${f} ${path}`;
    }
    case 'webroot': {
      // A deployed app's own log file; empty name means the scan found no log,
      // which the viewer reports instead of running a doomed `tail`.
      return `tail -n ${n}${f} ${shellArgForPath(target.name)}`;
    }
    case 'file':
    default:
      return `tail -n ${n}${f} ${shellQuote(target.name)}`;
  }
}

/** Label shown in the log header / used as the stream label. */
export function describeTarget(target: LogTarget): string {
  const kindLabel: Record<LogTargetKind, string> = {
    pm2: 'PM2',
    docker: 'Docker',
    systemd: 'Systemd',
    webroot: 'Webroot',
    file: 'File'
  };
  return `${kindLabel[target.kind]}:${target.name}`;
}

/**
 * Wrap a log command in sudo when the user is not in the docker/journal groups.
 * Mirrors buildDockerCommand so the two features behave identically.
 */
export function buildLogCommandWithSudo(
  target: LogTarget,
  lines: number,
  follow: boolean,
  useSudo: boolean = false,
  sudoPass?: string
): string {
  const base = buildLogCommand(target, lines, follow);
  if (!useSudo) return base;
  if (sudoPass && sudoPass.trim()) {
    const escaped = sudoPass.replace(/'/g, "'\\''");
    return `echo '${escaped}' | sudo -S ${base}`;
  }
  return `sudo ${base}`;
}

/** PM2 writes logs to ~/.pm2/logs/<name>-out.log and <name>-error.log. */
export function pm2LogPath(name: string, stream: 'out' | 'error' = 'out'): string {
  return `~/.pm2/logs/${name}-${stream}.log`;
}

/**
 * Resolve the log file a PM2 app actually writes to.
 * Prefers the path the daemon reported, falling back to the conventional name.
 */
export function resolvePm2LogPath(
  app: Pick<AppInfo, 'name' | 'outLog' | 'errLog'>,
  stream: 'out' | 'error' = 'out'
): string {
  if (stream === 'out' && app.outLog) return app.outLog;
  if (stream === 'error' && app.errLog) return app.errLog;
  return pm2LogPath(app.name, stream);
}

/**
 * Check the file exists before tailing, so we can explain a missing log instead
 * of dumping a raw `tail: cannot open ...` message into the viewer.
 */
export function buildLogExistsCommand(path: string): string {
  return `test -f ${shellArgForPath(path)} && echo __BOBA_EXISTS__ || echo __BOBA_MISSING__`;
}

/** A path argument that keeps a leading `~` expandable by the shell. */
export function shellArgForPath(path: string): string {
  return path.startsWith('~/') ? `~/${shellQuote(path.slice(2))}` : shellQuote(path);
}
