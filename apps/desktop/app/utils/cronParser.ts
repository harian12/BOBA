export interface CronJobItem {
  id: string;
  raw: string;
  schedule: string;
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
  command: string;
  comment?: string;
  enabled: boolean;
  humanDescription: string;
  source: 'user' | 'system' | 'custom';
}

export function isValidCronSchedule(schedule: string): boolean {
  if (schedule.startsWith('@')) {
    return ['@reboot', '@yearly', '@annually', '@monthly', '@weekly', '@daily', '@midnight', '@hourly'].includes(schedule.toLowerCase());
  }
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every(p => /^[\*0-9a-zA-Z\-\/,]+$/.test(p));
}

export function describeCronSchedule(schedule: string): string {
  if (!isValidCronSchedule(schedule)) return 'Jadwal tidak valid';
  const s = schedule.toLowerCase();
  if (s === '@reboot') return 'Saat sistem dinyalakan (boot)';
  if (s === '@daily' || s === '@midnight') return 'Setiap hari pukul 00:00';
  if (s === '@hourly') return 'Setiap jam';
  if (s === '@weekly') return 'Setiap minggu';
  if (s === '@monthly') return 'Setiap bulan';
  if (s === '@yearly' || s === '@annually') return 'Setiap tahun';

  const parts = schedule.split(/\s+/);
  if (parts.length < 5) return `Jadwal kustom: ${schedule}`;
  const m = parts[0] || '';
  const h = parts[1] || '';
  const dom = parts[2] || '';
  const mon = parts[3] || '';
  const dow = parts[4] || '';

  if (schedule === '* * * * *') return 'Setiap menit';
  if (m.startsWith('*/') && h === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `Setiap ${m.replace('*/', '')} menit`;
  }
  if (m === '0' && h === '*' && dom === '*' && mon === '*' && dow === '*') {
    return 'Setiap jam (menit ke-0)';
  }

  const pad = (n: string) => n.padStart(2, '0');

  if (/^\d+$/.test(m) && /^\d+$/.test(h) && dom === '*' && mon === '*' && dow === '*') {
    return `Setiap hari pukul ${pad(h)}:${pad(m)}`;
  }

  const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  if (/^\d+$/.test(m) && /^\d+$/.test(h) && dom === '*' && mon === '*' && /^[0-6]$/.test(dow)) {
    return `Setiap hari ${hari[parseInt(dow, 10)]} pukul ${pad(h)}:${pad(m)}`;
  }

  if (/^\d+$/.test(m) && /^\d+$/.test(h) && /^\d+$/.test(dom) && mon === '*' && dow === '*') {
    return `Setiap tanggal ${dom} pukul ${pad(h)}:${pad(m)}`;
  }

  return `Jadwal kustom: ${schedule}`;
}

export function parseCrontab(rawText: string, source: 'user' | 'system' = 'user'): CronJobItem[] {
  const lines = rawText.split('\n');
  const results: CronJobItem[] = [];
  let currentComment = '';

  for (let line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      currentComment = '';
      continue;
    }

    let isEnabled = true;
    let parseStr = trimmed;

    if (trimmed.startsWith('#')) {
      const stripped = trimmed.substring(1).trim();
      const tokens = stripped.split(/\s+/);
      const firstToken = tokens[0] || '';
      const firstFiveTokens = tokens.slice(0, 5).join(' ');

      if (isValidCronSchedule(firstToken)) {
        isEnabled = false;
        parseStr = stripped;
      } else if (isValidCronSchedule(firstFiveTokens)) {
        isEnabled = false;
        parseStr = stripped;
      } else {
        currentComment = currentComment ? `${currentComment}\n${stripped}` : stripped;
        continue;
      }
    }

    const parts = parseStr.split(/\s+/);
    let schedule = '';
    let commandStartIdx = 0;
    const firstPart = parts[0] || '';

    if (firstPart.startsWith('@')) {
      schedule = firstPart;
      commandStartIdx = 1;
    } else {
      schedule = parts.slice(0, 5).join(' ');
      commandStartIdx = 5;
    }

    if (!isValidCronSchedule(schedule)) {
      currentComment = '';
      continue;
    }

    const command = parts.slice(commandStartIdx).join(' ');
    const scheduleParts = schedule.split(/\s+/);
    const isAlias = schedule.startsWith('@');

    results.push({
      id: Math.random().toString(36).slice(2, 11),
      raw: line,
      schedule,
      minute: isAlias ? '' : (scheduleParts[0] || ''),
      hour: isAlias ? '' : (scheduleParts[1] || ''),
      dayOfMonth: isAlias ? '' : (scheduleParts[2] || ''),
      month: isAlias ? '' : (scheduleParts[3] || ''),
      dayOfWeek: isAlias ? '' : (scheduleParts[4] || ''),
      command,
      comment: currentComment || undefined,
      enabled: isEnabled,
      humanDescription: describeCronSchedule(schedule),
      source
    });

    currentComment = '';
  }

  return results;
}

export function serializeCrontab(items: CronJobItem[]): string {
  return items.map(item => {
    let out = '';
    if (item.comment) {
      out += item.comment.split('\n').map(c => `# ${c}`).join('\n') + '\n';
    }
    let line = '';
    if (!item.enabled) line += '# ';
    line += `${item.schedule} ${item.command}`;
    out += line;
    return out;
  }).join('\n');
}

export function buildCronSchedule(minute: string, hour: string, dom: string, month: string, dow: string): string {
  return [minute, hour, dom, month, dow].join(' ');
}
