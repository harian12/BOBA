import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeSetItem, safeGetItem, safeRemoveItem, usedBytes, byteSize } from '../app/utils/safeStorage.ts';

function withStorage(storage: unknown, fn: () => void) {
  const original = (globalThis as { localStorage?: unknown }).localStorage;
  if (storage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
  else (globalThis as { localStorage?: unknown }).localStorage = storage;
  try {
    fn();
  } finally {
    (globalThis as { localStorage?: unknown }).localStorage = original;
  }
}

const workingStore = () => {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map
  };
};

test('a normal write succeeds', () => {
  withStorage(workingStore(), () => {
    assert.equal(safeSetItem('k', 'v'), true);
    assert.equal(safeGetItem('k'), 'v');
    safeRemoveItem('k');
    assert.equal(safeGetItem('k'), null);
  });
});

test('a full quota reports failure instead of throwing', () => {
  // This is the exact crash the user hit: collapsing a sidebar folder threw a
  // QuotaExceededError into the click handler and took the handler down.
  const full = {
    get length() { return 1; },
    key: () => 'boba_ai_chat_threads',
    getItem: () => 'x'.repeat(10),
    setItem: () => { throw new DOMException('exceeded the quota', 'QuotaExceededError'); },
    removeItem: () => {}
  };
  withStorage(full, () => {
    assert.equal(safeSetItem('boba_collapsed_folders', '{}'), false);
    // The stub answers the same value for every key; the point is that reading
    // still works after a rejected write.
    assert.equal(safeGetItem('boba_collapsed_folders'), 'x'.repeat(10));
  });
});

test('access denied is handled like a full quota', () => {
  const denied = {
    get length() { throw new Error('denied'); },
    key: () => { throw new Error('denied'); },
    getItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
    removeItem: () => { throw new Error('denied'); }
  };
  withStorage(denied, () => {
    assert.equal(safeSetItem('k', 'v'), false);
    assert.equal(safeGetItem('k'), null);
    assert.doesNotThrow(() => safeRemoveItem('k'));
    assert.equal(usedBytes(), 0);
  });
});

test('no localStorage at all is not an error', () => {
  withStorage(undefined, () => {
    assert.equal(safeSetItem('k', 'v'), false);
    assert.equal(safeGetItem('k'), null);
    assert.doesNotThrow(() => safeRemoveItem('k'));
    assert.equal(usedBytes(), 0);
  });
});

test('usedBytes sums keys and values', () => {
  withStorage(workingStore(), () => {
    safeSetItem('ab', 'cdef');
    // 2 key chars + 4 value chars, at 2 bytes per char.
    assert.equal(usedBytes(), byteSize('ab') + byteSize('cdef'));
  });
});
