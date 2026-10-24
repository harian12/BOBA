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

export interface BuildSelectQueryOptions {
  engine: string | undefined | null;
  table: string;
  columns?: string[];
  whereClause?: string;
  orderByColumn?: string | null;
  orderDirection?: 'asc' | 'desc' | 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export function buildSelectTableQuery(options: BuildSelectQueryOptions): string {
  const {
    engine,
    table,
    columns = ['*'],
    whereClause,
    orderByColumn,
    orderDirection = 'asc',
    limit,
    offset,
  } = options;

  const tableIdent = quoteIdent(engine, table);
  const cols = columns.length === 1 && columns[0] === '*'
    ? '*'
    : columns.map(c => (c === '*' ? '*' : quoteIdent(engine, c))).join(', ');

  const parts = [`SELECT ${cols} FROM ${tableIdent}`];

  if (whereClause && whereClause.trim()) {
    parts.push(`WHERE ${whereClause.trim()}`);
  }

  if (orderByColumn && orderByColumn.trim()) {
    const colIdent = quoteIdent(engine, orderByColumn.trim());
    const dir = String(orderDirection).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    parts.push(`ORDER BY ${colIdent} ${dir}`);
  }

  if (typeof limit === 'number') {
    parts.push(`LIMIT ${limit}`);
  }

  if (typeof offset === 'number') {
    parts.push(`OFFSET ${offset}`);
  }

  return parts.join(' ') + ';';
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
  'deallocate', 'begin', 'end', 'commit', 'rollback', 'transaction', 'else',
  'then', 'case', 'when', 'union', 'all', 'distinct', 'constraint', 'references',
  'cascade', 'restrict', 'between', 'exists', 'true', 'false'
]);

const SQL_FUNCTIONS_SET = new Set([
  'count', 'sum', 'avg', 'min', 'max', 'round', 'if', 'coalesce', 'ifnull', 'nullif',
  'concat', 'now', 'curdate', 'curtime', 'date', 'datediff', 'date_add', 'date_sub',
  'date_format', 'substr', 'substring', 'trim', 'lower', 'upper', 'replace',
  'cast', 'convert', 'abs', 'ceil', 'ceiling', 'floor', 'length', 'char_length',
  'group_concat', 'greatest', 'least', 'uuid', 'md5', 'sha1', 'sha2'
]);

export function highlightSql(sql: string): string {
  if (!sql) return '';
  if (sql.length > 150_000) {
    return escapeHtml(sql);
  }

  const regex = /(--[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:''|[^'\\]|\\.)*(?:'|$)|"(?:""|[^"\\]|\\.)*(?:"|$)|`(?:``|[^`\\]|\\.)*(?:`|$)|@[a-zA-Z0-9_]+|\b\d+(?:\.\d+)?\b|[a-zA-Z_][a-zA-Z0-9_]*|:=|<=|>=|!=|<>|<=>|->>|->|[+\-*/%<>=&|^~;,().[\]{}]|[^\s\w]|\s+)/g;

  let result = '';
  let match: RegExpExecArray | null;

  while ((match = regex.exec(sql)) !== null) {
    const token = match[0];
    if (!token) {
      regex.lastIndex++;
      continue;
    }
    if (token.startsWith('--') || token.startsWith('#') || token.startsWith('/*')) {
      result += `<span class="text-slate-400 italic">${escapeHtml(token)}</span>`;
    } else if (token.startsWith("'") || token.startsWith('"')) {
      result += `<span class="text-emerald-400">${escapeHtml(token)}</span>`;
    } else if (token.startsWith('`')) {
      result += `<span class="text-sky-300 font-mono">${escapeHtml(token)}</span>`;
    } else if (token.startsWith('@')) {
      result += `<span class="text-purple-400 font-mono">${escapeHtml(token)}</span>`;
    } else if (/^\d+(?:\.\d+)?$/.test(token)) {
      result += `<span class="text-amber-300">${escapeHtml(token)}</span>`;
    } else if (SQL_FUNCTIONS_SET.has(token.toLowerCase())) {
      result += `<span class="text-amber-200 font-medium">${escapeHtml(token)}</span>`;
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

export function formatSql(sql: string): string {
  if (!sql || !sql.trim()) return '';

  const keywordsToNewline = [
    'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
    'INNER JOIN', 'CROSS JOIN', 'LEFT JOIN', 'RIGHT JOIN',
    'ORDER BY', 'GROUP BY', 'SELECT', 'FROM', 'WHERE',
    'AND', 'OR', 'HAVING', 'LIMIT', 'OFFSET', 'UNION ALL',
    'UNION', 'VALUES', 'SET'
  ];

  const lines = sql.split(/\r?\n/);
  const formattedLines: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('--') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
      formattedLines.push(trimmed);
      continue;
    }

    let processed = trimmed;
    for (const kw of keywordsToNewline) {
      const reg = new RegExp(`(?<=^|\\s)${kw.replace(/ /g, '\\s+')}(?=\\s|$)`, 'gi');
      processed = processed.replace(reg, `\n${kw}`);
    }

    formattedLines.push(...processed.split('\n').map(l => l.trim()).filter(Boolean));
  }

  return formattedLines.join('\n');
}

