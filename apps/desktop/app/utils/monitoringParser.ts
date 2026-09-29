export interface ProcessItem {
  pid: string;
  user: string;
  cpu: number;
  mem: number;
  command: string;
}

export interface ServerMetricsFull {
  cpu_usage: number;
  ram_used_mb: number;
  ram_total_mb: number;
  ram_percent: number;
  swap_used_mb: number;
  swap_total_mb: number;
  swap_percent: number;
  disk_used: string;
  disk_total: string;
  disk_percent: number;
  uptime: string;
  load_avg: string;
  cpu_cores: number;
  top_processes: ProcessItem[];
}

export function parseServerMetricsFull(rawOutput: string): ServerMetricsFull {
  const metrics: ServerMetricsFull = {
    cpu_usage: 0,
    ram_used_mb: 0,
    ram_total_mb: 0,
    ram_percent: 0,
    swap_used_mb: 0,
    swap_total_mb: 0,
    swap_percent: 0,
    disk_used: '0',
    disk_total: '0',
    disk_percent: 0,
    uptime: 'unknown',
    load_avg: '0.00, 0.00, 0.00',
    cpu_cores: 1,
    top_processes: []
  };

  if (!rawOutput) return metrics;

  let currentSection = '';
  let isFirstRamRow = true;

  for (const rawLine of rawOutput.split('\n')) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('---') && trimmed.endsWith('---')) {
      currentSection = trimmed;
      continue;
    }
    if (!trimmed) continue;

    switch (currentSection) {
      case '---CPU---': {
        const val = parseFloat(trimmed);
        if (!isNaN(val)) {
          metrics.cpu_usage = Math.round(val * 10) / 10;
        }
        break;
      }
      case '---RAM---': {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          const used = parseInt(parts[0] || '0', 10) || 0;
          const total = parseInt(parts[1] || '1', 10) || 1;
          if (isFirstRamRow) {
            metrics.ram_used_mb = used;
            metrics.ram_total_mb = total;
            metrics.ram_percent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
            isFirstRamRow = false;
          } else {
            metrics.swap_used_mb = used;
            metrics.swap_total_mb = total;
            metrics.swap_percent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
          }
        }
        break;
      }
      case '---DISK---': {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 3) {
          metrics.disk_used = parts[0] || '0';
          metrics.disk_total = parts[1] || '0';
          const pctStr = (parts[2] || '0').replace('%', '');
          const pct = parseFloat(pctStr);
          if (!isNaN(pct)) {
            metrics.disk_percent = pct;
          }
        }
        break;
      }
      case '---UPTIME---': {
        metrics.uptime = trimmed;
        break;
      }
      case '---LOAD---': {
        metrics.load_avg = trimmed;
        break;
      }
      case '---CORES---': {
        const cores = parseInt(trimmed, 10);
        metrics.cpu_cores = isNaN(cores) || cores < 1 ? 1 : cores;
        break;
      }
      case '---TOPPROC---': {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 5) {
          const pid = parts[0] || '';
          const user = parts[1] || '';
          const cpu = parseFloat(parts[2] || '0') || 0;
          const mem = parseFloat(parts[3] || '0') || 0;
          const command = parts.slice(4).join(' ');
          metrics.top_processes.push({
            pid,
            user,
            cpu,
            mem,
            command
          });
        }
        break;
      }
    }
  }

  return metrics;
}
