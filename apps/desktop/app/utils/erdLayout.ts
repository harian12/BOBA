export interface ErdColumn {
  name: string;
  data_type: string;
  is_primary_key: boolean;
}

export interface ErdTable {
  name: string;
  schema?: string | null;
  columns: ErdColumn[];
}

export interface ErdRelation {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
  constraint_name?: string | null;
}

export interface ErdPoint {
  x: number;
  y: number;
}

export interface ErdLine {
  id: string;
  d: string;
  fromKey: string;
  toKey: string;
  relation: ErdRelation;
}

export interface ErdLineResult {
  lines: ErdLine[];
  unresolved: ErdRelation[];
}

export const TABLE_WIDTH = 320;
export const GRID_COLUMNS = 4;
export const GRID_ORIGIN_X = 60;
export const GRID_ORIGIN_Y = 60;
export const GRID_STEP_X = 360;
export const GRID_STEP_Y = 400;
export const HEADER_HEIGHT = 38;
export const ROW_HEIGHT = 24;
export const MAX_VISIBLE_ROWS = 12;
export const RELATIONS_BLOCK_HEIGHT = 34;
export const RELATION_ROW_HEIGHT = 20;

export function tableKey(table: ErdTable): string {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

export function isFkColumn(relations: ErdRelation[], table: ErdTable, columnName: string): boolean {
  const name = table.name.toLowerCase();
  const col = columnName.toLowerCase();
  return relations.some(r => r.from_table.toLowerCase() === name && r.from_column.toLowerCase() === col);
}

export function relationsOf(relations: ErdRelation[], table: ErdTable): ErdRelation[] {
  const name = table.name.toLowerCase();
  return relations.filter(r => r.from_table.toLowerCase() === name);
}

export function defaultPosition(index: number): ErdPoint {
  const col = index % GRID_COLUMNS;
  const row = Math.floor(index / GRID_COLUMNS);
  return {
    x: GRID_ORIGIN_X + col * GRID_STEP_X,
    y: GRID_ORIGIN_Y + row * GRID_STEP_Y,
  };
}

/**
 * Merges user-saved positions with a deterministic grid fallback so that every
 * table always has a coordinate, even when a stored layout is partial or stale.
 */
export function buildPositions(
  tables: ErdTable[],
  saved: Record<string, ErdPoint> | null | undefined,
): Record<string, ErdPoint> {
  const out: Record<string, ErdPoint> = {};
  tables.forEach((t, idx) => {
    const key = tableKey(t);
    const stored = saved?.[key];
    if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) {
      out[key] = { x: stored.x, y: stored.y };
    } else {
      out[key] = defaultPosition(idx);
    }
  });
  return out;
}

export function buildNameLookup(tables: ErdTable[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const t of tables) {
    const key = tableKey(t);
    const bare = t.name.toLowerCase();
    if (!lookup.has(bare)) lookup.set(bare, key);
    const qualified = key.toLowerCase();
    if (!lookup.has(qualified)) lookup.set(qualified, key);
  }
  return lookup;
}

export function tableHeight(table: ErdTable, relationCount: number): number {
  const rows = Math.min(table.columns.length, MAX_VISIBLE_ROWS);
  const footer = relationCount > 0 ? RELATIONS_BLOCK_HEIGHT + relationCount * RELATION_ROW_HEIGHT : 0;
  return HEADER_HEIGHT + rows * ROW_HEIGHT + 10 + footer;
}

export function resolveLineId(relation: ErdRelation): string {
  return [
    relation.from_table,
    relation.from_column,
    relation.to_table,
    relation.to_column,
    relation.constraint_name || '',
  ].join('|');
}

function anchorPoints(
  from: ErdPoint,
  to: ErdPoint,
  fromHeight: number,
  toHeight: number,
): { sx: number; sy: number; ex: number; ey: number; horizontal: boolean } {
  const fromRight = from.x + TABLE_WIDTH;
  const toRight = to.x + TABLE_WIDTH;
  const fromMidY = from.y + HEADER_HEIGHT;
  const toMidY = to.y + HEADER_HEIGHT;

  if (fromRight < to.x) {
    return { sx: fromRight, sy: fromMidY, ex: to.x, ey: toMidY, horizontal: true };
  }
  if (toRight < from.x) {
    return { sx: from.x, sy: fromMidY, ex: toRight, ey: toMidY, horizontal: true };
  }
  if (from.y + fromHeight < to.y) {
    return { sx: from.x + TABLE_WIDTH / 2, sy: from.y + fromHeight, ex: to.x + TABLE_WIDTH / 2, ey: to.y, horizontal: false };
  }
  return { sx: from.x + TABLE_WIDTH / 2, sy: from.y, ex: to.x + TABLE_WIDTH / 2, ey: to.y + toHeight, horizontal: false };
}

export function relationPath(
  from: ErdPoint,
  to: ErdPoint,
  fromHeight: number,
  toHeight: number,
): string {
  const { sx, sy, ex, ey, horizontal } = anchorPoints(from, to, fromHeight, toHeight);
  if (horizontal) {
    const dx = Math.max(40, Math.abs(ex - sx) * 0.5);
    return `M ${sx} ${sy} C ${sx + dx} ${sy}, ${ex - dx} ${ey}, ${ex} ${ey}`;
  }
  const dy = Math.max(40, Math.abs(ey - sy) * 0.5);
  const dir = ey >= sy ? 1 : -1;
  return `M ${sx} ${sy} C ${sx} ${sy + dy * dir}, ${ex} ${ey - dy * dir}, ${ex} ${ey}`;
}

/**
 * Maps foreign-key relations onto positioned tables. Relations whose tables are
 * not part of the current schema view are reported instead of being dropped
 * silently, so a mismatch between the FK query and the loaded tables is visible.
 */
export function buildRelationLines(
  relations: ErdRelation[],
  tables: ErdTable[],
  positions: Record<string, ErdPoint>,
): ErdLineResult {
  const lookup = buildNameLookup(tables);
  const heights: Record<string, number> = {};
  for (const t of tables) {
    const key = tableKey(t);
    heights[key] = tableHeight(t, relationsOf(relations, t).length);
  }

  const lines: ErdLine[] = [];
  const unresolved: ErdRelation[] = [];
  const seen = new Set<string>();

  for (const rel of relations) {
    const fromKey = lookup.get(rel.from_table.toLowerCase());
    const toKey = lookup.get(rel.to_table.toLowerCase());
    const fromPos = fromKey ? positions[fromKey] : undefined;
    const toPos = toKey ? positions[toKey] : undefined;
    if (!fromKey || !toKey || !fromPos || !toPos) {
      unresolved.push(rel);
      continue;
    }
    const id = resolveLineId(rel);
    if (seen.has(id)) continue;
    seen.add(id);
    lines.push({
      id,
      d: relationPath(fromPos, toPos, heights[fromKey] || 0, heights[toKey] || 0),
      fromKey,
      toKey,
      relation: rel,
    });
  }

  return { lines, unresolved };
}

export interface ErdExtent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export function computeExtent(
  tables: ErdTable[],
  relations: ErdRelation[],
  positions: Record<string, ErdPoint>,
): ErdExtent {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const t of tables) {
    const pos = positions[tableKey(t)];
    if (!pos) continue;
    const h = tableHeight(t, relationsOf(relations, t).length);
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + TABLE_WIDTH);
    maxY = Math.max(maxY, pos.y + h);
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function escapeXml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function formatDataType(dataType: string): string {
  if (!dataType) return '';
  const trimmed = String(dataType).trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('enum(')) return 'enum(...)';
  if (lower.startsWith('set(')) return 'set(...)';
  return trimmed;
}

export interface BuildSvgOptions {
  tables: ErdTable[];
  relations: ErdRelation[];
  positions: Record<string, ErdPoint>;
  idPrefix?: string;
  padding?: number;
  background?: string;
}

export function buildErSvg(options: BuildSvgOptions): string {
  const { tables, relations, positions } = options;
  const idPrefix = options.idPrefix || 'erd';
  const padding = options.padding ?? 60;
  const background = options.background || '#0b0f19';
  const { lines, unresolved } = buildRelationLines(relations, tables, positions);
  const extent = computeExtent(tables, relations, positions);

  const width = Math.max(1200, Math.round(extent.width + padding * 2));
  const height = Math.max(800, Math.round(extent.height + padding * 2));
  const originX = Math.round(extent.minX - padding);
  const originY = Math.round(extent.minY - padding);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${originX} ${originY} ${width} ${height}" width="${width}" height="${height}" style="background-color: ${background}; font-family: ui-monospace, monospace, sans-serif;">`,
  );
  parts.push(`  <defs>`);
  parts.push(
    `    <pattern id="${idPrefix}-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="#1e293b" /></pattern>`,
  );
  parts.push(
    `    <marker id="${idPrefix}-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" /></marker>`,
  );
  parts.push(`  </defs>`);
  parts.push(`  <rect x="${originX}" y="${originY}" width="${width}" height="${height}" fill="${background}" />`);
  parts.push(`  <rect x="${originX}" y="${originY}" width="${width}" height="${height}" fill="url(#${idPrefix}-grid)" />`);

  const relationsLayer: string[] = [];
  for (const line of lines) {
    relationsLayer.push(
      `  <path data-erd-relation="${escapeXml(line.id)}" d="${line.d}" fill="none" stroke="#0284c7" stroke-width="2" stroke-dasharray="5,4" marker-end="url(#${idPrefix}-arrow)" />`,
    );
  }
  parts.push(`  <g id="${idPrefix}-relations">`);
  parts.push(...relationsLayer);
  parts.push(`  </g>`);

  const nodesLayer: string[] = [];
  for (const t of tables) {
    const key = tableKey(t);
    const pos = positions[key];
    if (!pos) continue;
    const rels = relationsOf(relations, t);
    const cardH = tableHeight(t, rels.length);
    const visibleRows = Math.min(t.columns.length, MAX_VISIBLE_ROWS);
    const clipped = t.columns.length - visibleRows;

    const g: string[] = [];
    g.push(`    <g data-erd-table="${escapeXml(t.name)}" data-erd-schema="${escapeXml(t.schema || '')}" transform="translate(${Math.round(pos.x)}, ${Math.round(pos.y)})">`);
    g.push(`      <rect width="${TABLE_WIDTH}" height="${cardH}" rx="10" fill="#111726" stroke="#334155" stroke-width="1.5" />`);
    g.push(`      <path d="M 0 10 Q 0 0 10 0 L ${TABLE_WIDTH - 10} 0 Q ${TABLE_WIDTH} 0 ${TABLE_WIDTH} 10 L ${TABLE_WIDTH} ${HEADER_HEIGHT - 2} L 0 ${HEADER_HEIGHT - 2} Z" fill="#141b2d" />`);
    g.push(`      <line x1="0" y1="${HEADER_HEIGHT - 2}" x2="${TABLE_WIDTH}" y2="${HEADER_HEIGHT - 2}" stroke="#334155" stroke-width="1" />`);
    g.push(`      <text x="14" y="23" fill="#bae6fd" font-size="12" font-weight="bold">${escapeXml(t.name)}</text>`);
    if (t.schema) {
      g.push(`      <text x="14" y="34" fill="#475569" font-size="9">${escapeXml(t.schema)}</text>`);
    }
    g.push(`      <text x="${TABLE_WIDTH - 14}" y="23" fill="#64748b" font-size="10" text-anchor="end">${t.columns.length} cols</text>`);

    t.columns.slice(0, visibleRows).forEach((c, idx) => {
      const y = HEADER_HEIGHT + 18 + idx * ROW_HEIGHT;
      const isPk = !!c.is_primary_key;
      const isFk = !isPk && isFkColumn(relations, t, c.name);
      const marker = isPk ? 'PK ' : (isFk ? 'FK ' : '• ');
      const color = isPk ? '#fde68a' : (isFk ? '#7dd3fc' : '#cbd5e1');
      g.push(`      <text x="14" y="${y}" fill="${color}" font-size="11">${escapeXml(marker + c.name)}</text>`);
      g.push(`      <text x="${TABLE_WIDTH - 14}" y="${y}" fill="#64748b" font-size="10" text-anchor="end">${escapeXml(formatDataType(c.data_type))}</text>`);
    });
    if (clipped > 0) {
      g.push(`      <text x="14" y="${HEADER_HEIGHT + 18 + visibleRows * ROW_HEIGHT}" fill="#475569" font-size="10">… +${clipped} kolom lainnya</text>`);
    }

    if (rels.length > 0) {
      const top = HEADER_HEIGHT + visibleRows * ROW_HEIGHT + 10;
      g.push(`      <rect x="0" y="${top}" width="${TABLE_WIDTH}" height="${cardH - top}" fill="#080d18" />`);
      g.push(`      <line x1="0" y1="${top}" x2="${TABLE_WIDTH}" y2="${top}" stroke="#1e293b" stroke-width="1" />`);
      g.push(`      <text x="14" y="${top + 14}" fill="#64748b" font-size="9" font-weight="bold">FOREIGN KEY</text>`);
      rels.forEach((rel, idx) => {
        const y = top + 14 + (idx + 1) * RELATION_ROW_HEIGHT;
        g.push(`      <text x="14" y="${y}" fill="#7dd3fc" font-size="10">${escapeXml(`${rel.from_column} → ${rel.to_table}.${rel.to_column}`)}</text>`);
      });
    }

    g.push(`    </g>`);
    nodesLayer.push(...g);
  }
  parts.push(`  <g id="${idPrefix}-tables">`);
  parts.push(...nodesLayer);
  parts.push(`  </g>`);

  if (unresolved.length > 0) {
    parts.push(`  <!-- ${unresolved.length} relasi foreign key tidak digambar: tabel tujuan tidak ada di diagram -->`);
  }
  parts.push(`</svg>`);

  return parts.join('\n');
}
