import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  quoteIdent,
  sqlLiteral,
  supportsTruncate,
  isSqlEngine,
  normalizeEngine,
  highlightSql,
  buildSelectTableQuery,
} from '../app/utils/dbmsSql.ts';

test('normalizeEngine lowercases and tolerates empty input', () => {
  assert.equal(normalizeEngine('PostgreSQL'), 'postgresql');
  assert.equal(normalizeEngine(undefined), '');
});

test('isSqlEngine accepts the SQL engines and rejects redis/mongodb', () => {
  for (const e of ['mysql', 'MariaDB', 'postgres', 'postgresql', 'sqlite']) {
    assert.equal(isSqlEngine(e), true, e);
  }
  for (const e of ['redis', 'mongodb', 'oracle', '']) {
    assert.equal(isSqlEngine(e), false, e);
  }
});

test('quoteIdent uses double quotes for PostgreSQL', () => {
  assert.equal(quoteIdent('postgres', 'users'), '"users"');
  assert.equal(quoteIdent('postgresql', 'user name'), '"user name"');
  // Embedded double quotes are doubled, not stripped.
  assert.equal(quoteIdent('postgres', 'we"ird'), '"we""ird"');
});

test('quoteIdent uses backticks for MySQL/MariaDB/SQLite', () => {
  assert.equal(quoteIdent('mysql', 'users'), '`users`');
  assert.equal(quoteIdent('mariadb', 'users'), '`users`');
  assert.equal(quoteIdent('sqlite', 'users'), '`users`');
  assert.equal(quoteIdent('sqlite', 'we`ird'), '`we``ird`');
});

test('quoteIdent leaves non-SQL engines unquoted', () => {
  assert.equal(quoteIdent('redis', 'session:123'), 'session:123');
  assert.equal(quoteIdent('mongodb', 'db.users'), 'db.users');
});

test('the old hardcoded backtick form is a PostgreSQL syntax error, the new one is not', () => {
  const name = 'select';
  assert.equal(quoteIdent('postgres', name), '"select"');
  assert.notEqual(quoteIdent('postgres', name), '`select`');
});

test('sqlLiteral renders NULL, numbers and quoted strings', () => {
  assert.equal(sqlLiteral('mysql', null), 'NULL');
  assert.equal(sqlLiteral('mysql', undefined), 'NULL');
  assert.equal(sqlLiteral('mysql', 42), '42');
  assert.equal(sqlLiteral('mysql', NaN), 'NULL');
  assert.equal(sqlLiteral('mysql', "O'Brien"), "'O''Brien'");
});

test('sqlLiteral uses native booleans for PostgreSQL and 1/0 elsewhere', () => {
  assert.equal(sqlLiteral('postgres', true), 'TRUE');
  assert.equal(sqlLiteral('postgres', false), 'FALSE');
  assert.equal(sqlLiteral('mysql', true), '1');
  assert.equal(sqlLiteral('sqlite', false), '0');
});

test('sqlLiteral escapes single quotes for every SQL engine', () => {
  for (const e of ['mysql', 'mariadb', 'postgres', 'sqlite']) {
    assert.equal(sqlLiteral(e, "it's"), "'it''s'", e);
  }
});

test('supportsTruncate is true only where TRUNCATE exists', () => {
  assert.equal(supportsTruncate('mysql'), true);
  assert.equal(supportsTruncate('mariadb'), true);
  assert.equal(supportsTruncate('postgres'), true);
  assert.equal(supportsTruncate('postgresql'), true);
  assert.equal(supportsTruncate('sqlite'), false);
  assert.equal(supportsTruncate('redis'), false);
  assert.equal(supportsTruncate('mongodb'), false);
});

test('highlightSql formats comments, keywords, and strings with distinct classes', () => {
  assert.equal(highlightSql(''), '');
  const out1 = highlightSql('-- ini komentar\nSELECT * FROM users;');
  assert.match(out1, /<span class="text-slate-500 italic">-- ini komentar<\/span>/);
  assert.match(out1, /<span class="text-sky-400 font-semibold">SELECT<\/span>/);
  assert.match(out1, /<span class="text-sky-400 font-semibold">FROM<\/span>/);

  const out2 = highlightSql('/* blok komentar */ WHERE name = \'boba\'');
  assert.match(out2, /<span class="text-slate-500 italic">\/\* blok komentar \*\/<\/span>/);
  assert.match(out2, /<span class="text-emerald-400">&#39;boba&#39;<\/span>/);
});

test('buildSelectTableQuery builds queries with order, pagination, and where clauses', () => {
  // Basic query
  assert.equal(
    buildSelectTableQuery({ engine: 'mysql', table: 'users', limit: 100, offset: 0 }),
    'SELECT * FROM `users` LIMIT 100 OFFSET 0;'
  );

  // PostgreSQL identifier quotes and ORDER BY ASC
  assert.equal(
    buildSelectTableQuery({
      engine: 'postgres',
      table: 'users',
      orderByColumn: 'email',
      orderDirection: 'asc',
      limit: 50,
      offset: 0,
    }),
    'SELECT * FROM "users" ORDER BY "email" ASC LIMIT 50 OFFSET 0;'
  );

  // ORDER BY DESC with WHERE clause
  assert.equal(
    buildSelectTableQuery({
      engine: 'sqlite',
      table: 'orders',
      whereClause: '`status` = \'paid\'',
      orderByColumn: 'created_at',
      orderDirection: 'desc',
      limit: 25,
      offset: 50,
    }),
    'SELECT * FROM `orders` WHERE `status` = \'paid\' ORDER BY `created_at` DESC LIMIT 25 OFFSET 50;'
  );
});
