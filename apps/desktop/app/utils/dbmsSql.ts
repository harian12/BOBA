export type SqlEngine = 'mysql' | 'mariadb' | 'postgres' | 'postgresql' | 'sqlite' | 'redis' | 'mongodb' | string;

export function normalizeEngine(engine: string | undefined | null): string {
  return (engine || '').toLowerCase();
}

export function isSqlEngine(engine: string | undefined | null): boolean {
  const e = normalizeEngine(engine);
  return ['mysql', 'mariadb', 'postgres', 'postgresql', 'sqlite'].includes(e);
}

export function quoteIdent(engine: string | undefined | null, name: string): string {
  const e = normalizeEngine(engine);
  if (e === 'postgres' || e === 'postgresql') {
    return `"${String(name).replace(/"/g, '""')}"`;
  }
  if (['mysql', 'mariadb', 'sqlite'].includes(e)) {
    return `\`${String(name).replace(/`/g, '``')}\``;
  }
  return String(name);
}

export function sqlLiteral(engine: string | undefined | null, value: unknown): string {
  const e = normalizeEngine(engine);
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') {
    if (e === 'postgres' || e === 'postgresql') return value ? 'TRUE' : 'FALSE';
    return value ? '1' : '0';
  }
  const str = String(value);
  if (e === 'postgres' || e === 'postgresql') {
    return `'${str.replace(/'/g, "''")}'`;
  }
  return `'${str.replace(/'/g, "''")}'`;
}

/** Only MySQL/MariaDB and PostgreSQL implement TRUNCATE. */
export function supportsTruncate(engine: string | undefined | null): boolean {
  const e = normalizeEngine(engine);
  return ['mysql', 'mariadb', 'postgres', 'postgresql'].includes(e);
}
