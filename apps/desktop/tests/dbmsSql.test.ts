import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  quoteIdent,
  sqlLiteral,
  supportsTruncate,
  isSqlEngine,
  normalizeEngine,
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
