export interface DockerContainer {
  id: string;
  names: string;
  image: string;
  status: string;
  state: 'running' | 'exited' | 'paused' | 'restarting' | 'dead' | string;
  ports: string;
  created: string;
  cpuPercent?: string;
  memUsage?: string;
}

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
}

export interface DockerVolume {
  name: string;
  driver: string;
  scope: string;
}

export interface DockerNetwork {
  id: string;
  name: string;
  driver: string;
  scope: string;
}

export interface DockerStatItem {
  id: string;
  cpu: string;
  mem: string;
}

/**
 * Parses json lines emitted by docker ps --format '{{json .}}'
 */
export function parseDockerContainers(output: string): DockerContainer[] {
  if (!output || !output.trim()) return [];
  const lines = output.trim().split(/\r?\n/);
  const result: DockerContainer[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      result.push({
        id: parsed.id || parsed.ID || '',
        names: parsed.names || parsed.Names || '',
        image: parsed.image || parsed.Image || '',
        status: parsed.status || parsed.Status || '',
        state: (parsed.state || parsed.State || 'unknown').toLowerCase(),
        ports: parsed.ports || parsed.Ports || '',
        created: parsed.created || parsed.CreatedAt || '',
      });
    } catch {
      // ignore malformed line
    }
  }

  return result;
}

/**
 * Parses docker stats --no-stream --format '{"id":"{{.ID}}","cpu":"{{.CPUPerc}}","mem":"{{.MemUsage}}"}'
 */
export function parseDockerStats(output: string): Record<string, DockerStatItem> {
  if (!output || !output.trim()) return {};
  const lines = output.trim().split(/\r?\n/);
  const result: Record<string, DockerStatItem> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      const id = (parsed.id || parsed.ID || '').toLowerCase();
      if (id) {
        result[id] = {
          id,
          cpu: parsed.cpu || parsed.CPUPerc || '0%',
          mem: parsed.mem || parsed.MemUsage || '0B',
        };
      }
    } catch {
      // ignore malformed line
    }
  }

  return result;
}

/**
 * Parses docker volume ls --format '{"name":"{{.Name}}","driver":"{{.Driver}}","scope":"{{.Scope}}"}'
 */
export function parseDockerVolumes(output: string): DockerVolume[] {
  if (!output || !output.trim()) return [];
  const lines = output.trim().split(/\r?\n/);
  const result: DockerVolume[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      result.push({
        name: parsed.name || parsed.Name || '',
        driver: parsed.driver || parsed.Driver || 'local',
        scope: parsed.scope || parsed.Scope || 'local',
      });
    } catch {
      // ignore malformed line
    }
  }

  return result;
}

/**
 * Parses docker network ls --format '{"id":"{{.ID}}","name":"{{.Name}}","driver":"{{.Driver}}","scope":"{{.Scope}}"}'
 */
export function parseDockerNetworks(output: string): DockerNetwork[] {
  if (!output || !output.trim()) return [];
  const lines = output.trim().split(/\r?\n/);
  const result: DockerNetwork[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      result.push({
        id: parsed.id || parsed.ID || '',
        name: parsed.name || parsed.Name || '',
        driver: parsed.driver || parsed.Driver || 'bridge',
        scope: parsed.scope || parsed.Scope || 'local',
      });
    } catch {
      // ignore malformed line
    }
  }

  return result;
}

export function parseDockerImages(output: string): DockerImage[] {
  if (!output || !output.trim()) return [];
  const lines = output.trim().split(/\r?\n/);
  const result: DockerImage[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      result.push({
        id: parsed.id || parsed.ID || '',
        repository: parsed.repository || parsed.Repository || '',
        tag: parsed.tag || parsed.Tag || '',
        size: parsed.size || parsed.Size || '',
        created: parsed.created || parsed.CreatedAt || '',
      });
    } catch {
      // ignore malformed line
    }
  }

  return result;
}

export function buildDockerCommand(baseCmd: string, useSudo: boolean = false, sudoPass?: string): string {
  if (!useSudo) {
    return baseCmd;
  }
  if (sudoPass && sudoPass.trim()) {
    const escaped = sudoPass.replace(/'/g, "'\\''");
    return `echo '${escaped}' | sudo -S ${baseCmd}`;
  }
  return `sudo ${baseCmd}`;
}
