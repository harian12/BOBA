import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildErSvg,
  buildPositions,
  buildRelationLines,
  computeExtent,
  defaultPosition,
  escapeXml,
  formatDataType,
  relationsOf,
  tableHeight,
  tableKey,
  type ErdRelation,
  type ErdTable,
} from '../app/utils/erdLayout.ts';

const users: ErdTable = {
  name: 'users',
  schema: 'public',
  columns: [
    { name: 'id', data_type: 'integer', is_primary_key: true },
    { name: 'email', data_type: 'varchar(255)', is_primary_key: false },
  ],
};

const orders: ErdTable = {
  name: 'orders',
  schema: 'public',
  columns: [
    { name: 'id', data_type: 'integer', is_primary_key: true },
    { name: 'user_id', data_type: 'integer', is_primary_key: false },
  ],
};

const fk: ErdRelation = {
  from_table: 'orders',
  from_column: 'user_id',
  to_table: 'users',
  to_column: 'id',
  constraint_name: 'orders_user_id_fkey',
};

test('tableKey qualifies by schema so same-named tables do not collide', () => {
  assert.equal(tableKey(users), 'public.users');
  assert.equal(tableKey({ name: 'audit', schema: null, columns: [] }), 'audit');
});

test('buildPositions falls back to the grid for tables missing from a partial saved layout', () => {
  const tables = [users, orders];
  const positions = buildPositions(tables, { 'public.users': { x: 10, y: 20 } });

  assert.deepEqual(positions['public.users'], { x: 10, y: 20 });
  assert.deepEqual(positions['public.orders'], defaultPosition(1));
  assert.deepEqual(positions['public.orders'], { x: 420, y: 60 });
});

test('buildPositions ignores malformed stored coordinates', () => {
  const positions = buildPositions([users], { 'public.users': { x: NaN, y: 5 } });
  assert.deepEqual(positions['public.users'], defaultPosition(0));
});

test('relations still resolve when only part of the layout is persisted', () => {
  const positions = buildPositions([users, orders], { 'public.users': { x: 900, y: 100 } });
  const { lines, unresolved } = buildRelationLines([fk], [users, orders], positions);

  assert.equal(unresolved.length, 0);
  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.fromKey, 'public.orders');
  assert.equal(lines[0]?.toKey, 'public.users');
  assert.match(lines[0]?.d ?? '', /^M [\d.]+ [\d.]+ C /);
});

test('table name matching is case insensitive and never case sensitive on positions', () => {
  const mixed: ErdTable = { name: 'Users', schema: 'Public', columns: users.columns };
  const positions = buildPositions([mixed, orders], null);
  const { lines, unresolved } = buildRelationLines(
    [{ ...fk, from_table: 'ORDERS', to_table: 'users' }],
    [mixed, orders],
    positions,
  );

  assert.equal(unresolved.length, 0);
  assert.equal(lines.length, 1);
});

test('relations pointing outside the loaded tables are reported, not silently dropped', () => {
  const positions = buildPositions([users], null);
  const { lines, unresolved } = buildRelationLines([fk], [users], positions);

  assert.equal(lines.length, 0);
  assert.equal(unresolved.length, 1);
});

test('duplicate foreign-key rows collapse into a single line', () => {
  const positions = buildPositions([users, orders], null);
  const { lines } = buildRelationLines([fk, { ...fk }], [users, orders], positions);
  assert.equal(lines.length, 1);
});

test('a vertically stacked pair is connected with vertical control points', () => {
  const stacked = {
    'public.orders': { x: 60, y: 60 },
    'public.users': { x: 60, y: 700 },
  };
  const { lines } = buildRelationLines([fk], [users, orders], stacked);
  assert.equal(lines.length, 1);

  const [, sx, sy, c1x, c1y, , , ex, ey] = lines[0]!.d
    .match(/M ([\d.]+) ([\d.]+) C ([\d.]+) ([\d.]+), ([\d.]+) ([\d.]+), ([\d.]+) ([\d.]+)/)!
    .map(Number);
  assert.equal(sx, ex, 'same x for a vertical stack');
  assert.equal(c1x, sx, 'first control point keeps the x anchor');
  assert.ok((c1y ?? 0) > (sy ?? 0), 'first control point pushes downward');
  assert.equal(sy, 60 + tableHeight(orders, 1), 'leaves the bottom edge of the source card');
  assert.equal(ey, 700, 'enters the top edge of the target card');
});

test('a horizontally separated pair leaves the right edge and enters the left edge', () => {
  const positions = {
    'public.orders': { x: 60, y: 60 },
    'public.users': { x: 900, y: 60 },
  };
  const { lines } = buildRelationLines([fk], [users, orders], positions);
  const start = lines[0]!.d.match(/^M ([\d.]+) ([\d.]+)/)!;
  assert.equal(Number(start[1]), 60 + 320, 'right edge of the source card');
  assert.equal(Number(start[2]), 60 + 38, 'header height anchor');
  assert.match(lines[0]!.d, /900 [\d.]+$/, 'terminates on the left edge of the target card');
});

test('tableHeight grows with the outgoing relations block and clamps long column lists', () => {
  const plain = tableHeight(users, 0);
  const withFk = tableHeight(orders, 2);
  assert.ok(withFk > plain, 'footer block adds height');

  const wide: ErdTable = { name: 'wide', columns: Array.from({ length: 40 }, (_, i) => ({ name: `c${i}`, data_type: 'int', is_primary_key: false })) };
  assert.equal(tableHeight(wide, 0), tableHeight({ ...wide, columns: wide.columns.slice(0, 12) }, 0));
});

test('relationsOf matches the owning table case insensitively', () => {
  assert.equal(relationsOf([fk], orders).length, 1);
  assert.equal(relationsOf([fk], users).length, 0);
});

test('computeExtent covers every positioned table including relation footers', () => {
  const positions = buildPositions([users, orders], null);
  const extent = computeExtent([users, orders], [fk], positions);

  assert.equal(extent.minX, 60);
  assert.equal(extent.minY, 60);
  assert.ok(extent.maxY >= 60 + tableHeight(orders, 1));
  assert.equal(extent.width, Math.max(420 + 320, 60 + 320) - 60);
});

test('computeExtent on an empty table list is zero sized instead of Infinity', () => {
  const extent = computeExtent([], [], {});
  assert.deepEqual(extent, { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 });
});

test('exported SVG contains connector paths and one node group per table', () => {
  const positions = buildPositions([users, orders], null);
  const svg = buildErSvg({ tables: [users, orders], relations: [fk], positions, idPrefix: 't' });

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="-?\d+ -?\d+ \d+ \d+"/);
  assert.match(svg, /marker-end="url\(#t-arrow\)"/);
  assert.equal(svg.match(/<path data-erd-relation=/g)?.length, 1);
  assert.equal(svg.match(/data-erd-table="/g)?.length, 2);
  assert.match(svg, /data-erd-table="orders"/);
  assert.match(svg, /data-erd-schema="public"/);
  assert.match(svg, /user_id → users\.id/);
  assert.match(svg, /PK id/);
  assert.match(svg, /FK user_id/);
  assert.match(svg, /<g id="t-tables">/);
  assert.ok(svg.trimEnd().endsWith('</svg>'));
});

test('exported SVG is emitted even when the relation layer is empty', () => {
  const positions = buildPositions([users], null);
  const svg = buildErSvg({ tables: [users], relations: [], positions });
  assert.equal(svg.match(/<path data-erd-relation=/g), null);
  assert.equal(svg.match(/data-erd-table="/g)?.length, 1);
});

test('exported SVG escapes identifiers and clips long column lists', () => {
  const weird: ErdTable = {
    name: 'a & b',
    schema: 'p<x>',
    columns: Array.from({ length: 15 }, (_, i) => ({ name: `c"${i}`, data_type: 'int', is_primary_key: false })),
  };
  const svg = buildErSvg({ tables: [weird], relations: [], positions: buildPositions([weird], null) });

  assert.match(svg, /data-erd-table="a &amp; b"/);
  assert.match(svg, /data-erd-schema="p&lt;x&gt;"/);
  assert.match(svg, /\+3 kolom lainnya/);
  assert.equal(svg.match(/<text /g)?.length, 1 + 1 + 1 + 12 * 2 + 1);
});

test('exported SVG notes relations that could not be drawn', () => {
  const svg = buildErSvg({ tables: [users], relations: [fk], positions: buildPositions([users], null) });
  assert.match(svg, /1 relasi foreign key tidak digambar/);
});

test('escapeXml and formatDataType', () => {
  assert.equal(escapeXml(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&apos;');
  assert.equal(formatDataType("enum('a','b')"), 'enum(...)');
  assert.equal(formatDataType('SET(1,2)'), 'set(...)');
  assert.equal(formatDataType('  int4  '), 'int4');
  assert.equal(formatDataType(''), '');
});
