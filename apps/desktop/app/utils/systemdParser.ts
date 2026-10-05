export interface SystemdUnit {
  unit: string;
  name: string;
  load: string;
  active: string;
  sub: string;
  description: string;
  enabled?: string;
}

export interface SystemdTimer {
  unit: string;
  activates: string;
  next: string;
  last: string;
  rawTiming?: string;
}

export interface SystemdSocket {
  listen: string;
  unit: string;
  activates: string;
}

/**
 * Sanitizes systemd unit name to only valid characters preventing command injection.
 */
export function safeUnitName(unit: string): string {
  if (!unit || typeof unit !== 'string') return '';
  return unit.trim().replace(/[^a-zA-Z0-9_@\-\.:\\]/g, '');
}

/**
 * Parses lines from `systemctl list-units --type=service --all --no-legend --no-pager --plain`
 */
export function parseSystemdUnits(output: string): SystemdUnit[] {
  if (!output || !output.trim()) return [];
  const lines = output.trim().split(/\r?\n/);
  const result: SystemdUnit[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('UNIT') || trimmed.startsWith('LOAD') || trimmed.startsWith('ACTIVE') || trimmed.includes('loaded units listed')) {
      continue;
    }

    // Strip leading bullet '●' or '*' or '+' or whitespace
    const clean = trimmed.replace(/^[●*+•\s]+/, '').trim();
    // Pattern: UNIT LOAD ACTIVE SUB [DESCRIPTION...]
    const match = clean.match(/^([a-zA-Z0-9_@\-\.:\\]+)\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/);
    if (!match || !match[1] || !match[2] || !match[3] || !match[4]) continue;

    const unit = match[1];
    // Ignore header remnants if any
    if (unit.toLowerCase() === 'unit' || unit.toLowerCase() === 'legend:') continue;

    const name = unit.replace(/\.[^.]+$/, '');
    const load = match[2].toLowerCase();
    const active = match[3].toLowerCase();
    const sub = match[4].toLowerCase();
    const description = (match[5] || '').trim();

    result.push({
      unit,
      name,
      load,
      active,
      sub,
      description
    });
  }

  return result;
}

/**
 * Parses lines from `systemctl list-unit-files --type=service --no-legend --no-pager`
 */
export function parseSystemdUnitFiles(output: string): Record<string, string> {
  if (!output || !output.trim()) return {};
  const lines = output.trim().split(/\r?\n/);
  const result: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('UNIT FILE') || trimmed.includes('unit files listed')) continue;

    const match = trimmed.match(/^([a-zA-Z0-9_@\-\.:\\]+)\s+([a-zA-Z0-9_\-]+)/);
    if (match && match[1] && match[2]) {
      result[match[1]] = match[2].toLowerCase();
    }
  }

  return result;
}

/**
 * Enriches unit list with unit-files enabled state, and appends any inactive unit files.
 */
export function enrichUnitsWithUnitFiles(
  units: SystemdUnit[],
  unitFilesMap: Record<string, string>
): SystemdUnit[] {
  const existingMap = new Set(units.map((u) => u.unit));

  for (const u of units) {
    if (unitFilesMap[u.unit]) {
      u.enabled = unitFilesMap[u.unit];
    } else {
      u.enabled = 'unknown';
    }
  }

  for (const [unit, state] of Object.entries(unitFilesMap)) {
    if (!existingMap.has(unit)) {
      units.push({
        unit,
        name: unit.replace(/\.[^.]+$/, ''),
        load: 'loaded',
        active: 'inactive',
        sub: 'dead',
        description: '',
        enabled: state
      });
    }
  }

  return units;
}

/**
 * Parses lines from `systemctl list-timers --all --no-legend --no-pager`
 */
export function parseSystemdTimers(output: string): SystemdTimer[] {
  if (!output || !output.trim()) return [];
  const lines = output.trim().split(/\r?\n/);
  const result: SystemdTimer[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('NEXT') || trimmed.includes('timers listed')) continue;

    // Pattern: [timings...] <unit.timer> <activates>
    const match = trimmed.match(/^(.*?)\s+([a-zA-Z0-9_@\-\.:\\]+\.timer)\s+([a-zA-Z0-9_@\-\.:\\]+)\s*$/);
    if (match && match[1] !== undefined && match[2] && match[3]) {
      const unit = match[2];
      const activates = match[3];
      const timingPart = match[1].trim();

      let next = '';
      let last = '';

      const naMatch = timingPart.match(/^n\/a\s+n\/a\s*(.*)$/);
      if (naMatch) {
        next = 'n/a';
        last = naMatch[1]?.trim() || 'n/a';
      } else {
        const leftIdx = timingPart.indexOf('left');
        if (leftIdx !== -1) {
          next = timingPart.substring(0, leftIdx + 4).trim();
          last = timingPart.substring(leftIdx + 4).trim();
        } else {
          next = timingPart;
        }
      }

      result.push({
        unit,
        activates,
        next: next || 'n/a',
        last: last || 'n/a',
        rawTiming: timingPart
      });
    }
  }

  return result;
}

/**
 * Parses lines from `systemctl list-sockets --all --no-legend --no-pager`
 */
export function parseSystemdSockets(output: string): SystemdSocket[] {
  if (!output || !output.trim()) return [];
  const lines = output.trim().split(/\r?\n/);
  const result: SystemdSocket[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('LISTEN') || trimmed.includes('sockets listed')) continue;

    const match = trimmed.match(/^(\S+)\s+([a-zA-Z0-9_@\-\.:\\]+\.socket)\s+([a-zA-Z0-9_@\-\.:\\]+)\s*$/);
    if (match && match[1] && match[2] && match[3]) {
      result.push({
        listen: match[1],
        unit: match[2],
        activates: match[3]
      });
    }
  }

  return result;
}

export interface SystemdAllData {
  units: SystemdUnit[];
  timers: SystemdTimer[];
  sockets: SystemdSocket[];
}

/**
 * Parses multi-section combined SSH output.
 */
export function parseCombinedSystemdOutput(output: string): SystemdAllData {
  const getSection = (name: string): string => {
    const startTag = `---${name}---`;
    const start = output.indexOf(startTag);
    if (start === -1) return '';
    const after = output.substring(start + startTag.length);
    const nextTag = after.search(/\r?\n---[A-Z]+---/);
    if (nextTag !== -1) {
      return after.substring(0, nextTag).trim();
    }
    return after.trim();
  };

  const unitsRaw = getSection('UNITS');
  const unitFilesRaw = getSection('UNITFILES');
  const timersRaw = getSection('TIMERS');
  const socketsRaw = getSection('SOCKETS');

  const baseUnits = parseSystemdUnits(unitsRaw);
  const unitFiles = parseSystemdUnitFiles(unitFilesRaw);
  const enrichedUnits = enrichUnitsWithUnitFiles(baseUnits, unitFiles);
  const timers = parseSystemdTimers(timersRaw);
  const sockets = parseSystemdSockets(socketsRaw);

  return {
    units: enrichedUnits,
    timers,
    sockets
  };
}

/**
 * Builds systemd execution command with optional sudo support.
 */
export function buildSystemdCommand(baseCmd: string, useSudo: boolean = false, sudoPass?: string): string {
  if (!useSudo) {
    return baseCmd;
  }
  if (sudoPass && sudoPass.trim()) {
    const escaped = sudoPass.replace(/'/g, "'\\''");
    return `echo '${escaped}' | sudo -S ${baseCmd}`;
  }
  return `sudo ${baseCmd}`;
}
