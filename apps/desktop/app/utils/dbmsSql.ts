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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SQL_KEYWORDS_SET = new Set([
  'select', 'insert', 'update', 'delete', 'from', 'where', 'join', 'left', 'right',
  'inner', 'outer', 'cross', 'on', 'group', 'order', 'by', 'having', 'limit', 'offset',
  'and', 'or', 'not', 'in', 'is', 'null', 'like', 'ilike', 'as', 'table', 'database',
  'schema', 'view', 'index', 'alter', 'create', 'drop', 'modify', 'add', 'column',
  'set', 'into', 'values', 'truncate', 'use', 'show', 'describe', 'desc', 'asc',
  'explain', 'primary', 'foreign', 'key', 'unique', 'default', 'prepare', 'execute',
  'deallocate', 'begin', 'end', 'commit', 'rollback', 'transaction', 'if', 'else',
  'then', 'case', 'when', 'union', 'all', 'distinct', 'constraint', 'references',
  'cascade', 'restrict', 'between', 'exists', 'count', 'sum', 'avg', 'min', 'max'
]);

export function highlightSql(sql: string): string {
  if (!sql) return '';

  const regex = /(--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:''|[^'\\]|\\.)*(?:'|$)|"(?:""|[^"\\]|\\.)*(?:"|$)|`[^`]*`|@[a-zA-Z0-9_]+|\b\d+(?:\.\d+)?\b|[a-zA-Z_][a-zA-Z0-9_]*|[^\s\w]+|\s+)/g;

  let result = '';
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sql)) !== null) {
    const token = match[0];
    if (token.startsWith('--') || token.startsWith('#') || token.startsWith('/*')) {
      result += `<span class="text-slate-500 italic">${escapeHtml(token)}</span>`;
    } else if (token.startsWith("'") || token.startsWith('"')) {
      result += `<span class="text-emerald-400">${escapeHtml(token)}</span>`;
    } else if (token.startsWith('`')) {
      result += `<span class="text-sky-300 font-mono">${escapeHtml(token)}</span>`;
    } else if (token.startsWith('@')) {
      result += `<span class="text-purple-400 font-mono">${escapeHtml(token)}</span>`;
    } else if (/^\d+(?:\.\d+)?$/.test(token)) {
      result += `<span class="text-amber-300">${escapeHtml(token)}</span>`;
    } else if (SQL_KEYWORDS_SET.has(token.toLowerCase())) {
      result += `<span class="text-sky-400 font-semibold">${escapeHtml(token)}</span>`;
    } else {
      result += escapeHtml(token);
    }
  }

  if (sql.endsWith('\n')) {
    result += '\n';
  }

  return result;
}
