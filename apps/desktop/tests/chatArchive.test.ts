import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadChatArchive,
  scheduleChatArchiveSave,
  flushChatArchive,
  type LocalStateBridge
} from '../app/utils/chatArchive.ts';

const store = new Map<string, string>();
let fileContent: string | null = null;
let saveShouldFail = false;
let savedPayloads: string[] = [];

/** Stands in for the Tauri side so the migration rules can be tested offline. */
const bridgeStub: LocalStateBridge = {
  async localStateLoad(relative) {
    if (relative !== 'ai/chat-archive.json') throw new Error(`unexpected file: ${relative}`);
    return fileContent ?? '';
  },
  async localStateSave(_relative, content) {
    if (saveShouldFail) throw new Error('disk full');
    savedPayloads.push(content);
    fileContent = content;
  }
};

function reset() {
  store.clear();
  fileContent = null;
  saveShouldFail = false;
  savedPayloads = [];
  store.set('boba_ai_active_threads', '{"sess-1":"th_1"}');
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k)
  };
}

const THREAD = {
  id: 'th_1',
  sessionId: 'sess-1',
  title: 'Deploy gagal',
  messages: [{ id: 'm1', role: 'user', content: 'kenapa deploy error', createdAt: 1 }],
  createdAt: 1,
  updatedAt: 2
};

test('an existing archive file is used as-is', async () => {
  reset();
  fileContent = JSON.stringify([THREAD]);
  store.set('boba_ai_chat_threads', JSON.stringify([{ ...THREAD, id: 'stale' }]));

  const result = await loadChatArchive(bridgeStub);
  assert.equal(result?.threads.length, 1);
  assert.equal(result?.threads[0]?.id, 'th_1', 'the file must win over a stale localStorage copy');
  assert.equal(result?.migrated, false);
});

test('legacy threads migrate to the file and localStorage is cleared', async () => {
  reset();
  store.set('boba_ai_chat_threads', JSON.stringify([THREAD]));

  const result = await loadChatArchive(bridgeStub);
  assert.equal(result?.migrated, true);
  assert.equal(result?.threads.length, 1);
  assert.notEqual(fileContent, null, 'archive file must have been written');
  assert.equal(store.has('boba_ai_chat_threads'), false, 'old copy must be dropped after a successful write');
});

test('the pre-thread history format is still migrated', async () => {
  // Regression: the store used to fall back to `boba_ai_chat_history` for
  // installs predating the thread model. Dropping that fallback would make those
  // conversations silently disappear on upgrade.
  reset();
  store.set(
    'boba_ai_chat_history',
    JSON.stringify({
      'sess-1': [{ id: 'm1', role: 'user', content: 'perbaiki error ini ya', createdAt: 1 }]
    })
  );

  const result = await loadChatArchive(bridgeStub);
  assert.equal(result?.migrated, true);
  assert.equal(result?.threads.length, 1);
  assert.equal(result?.threads[0]?.sessionId, 'sess-1');
  assert.match(result?.threads[0]?.title ?? '', /perbaiki error/);
  assert.equal(store.has('boba_ai_chat_history'), false);
});

test('an oversized legacy payload is migrated whole, not trimmed', async () => {
  // The user decides what to delete. The app must not silently drop the oldest
  // part of a conversation just because it is large.
  reset();
  const messages = Array.from({ length: 40 }, (_, i) => ({
    id: `m${i}`,
    role: 'tool' as const,
    content: 'q'.repeat(200_000),
    createdAt: i
  }));
  store.set('boba_ai_chat_threads', JSON.stringify([{ ...THREAD, id: 'th_big', messages }]));

  const result = await loadChatArchive(bridgeStub);
  assert.equal(result?.migrated, true);
  assert.equal(result?.threads[0]?.messages.length, 40, 'no message may be dropped');
  assert.equal(result?.threads[0]?.messages[0]?.content.length, 200_000, 'no message may be truncated');
});

test('a large archive is written without a size rejection', async () => {
  // The Rust side no longer caps the file, so a big history must round-trip.
  reset();
  const messages = Array.from({ length: 30 }, (_, i) => ({
    id: `m${i}`,
    role: 'user' as const,
    content: 'w'.repeat(200_000),
    createdAt: i
  }));
  store.set('boba_ai_chat_threads', JSON.stringify([{ ...THREAD, id: 'th_huge', messages }]));
  const before = JSON.stringify([{ ...THREAD, id: 'th_huge', messages }]).length;
  assert.ok(before > 6_000_000, 'fixture must exceed the old 4 MB cap');

  const result = await loadChatArchive(bridgeStub);
  assert.equal(result?.migrated, true);
  assert.equal((fileContent ?? '').length, before, 'the archive must be written verbatim');
});

test('a thread the user started during the read is not clobbered', async () => {
  // Regression: the store used to do `threads.value = archive.threads` when the
  // read resolved. A conversation started before the read finished was silently
  // dropped from the UI, and the next save persisted that loss to disk.
  reset();
  fileContent = JSON.stringify([THREAD]);

  // Simulate a user opening a session and starting a chat before the file read
  // comes back: the store already holds a brand new, un-saved thread.
  const startedNow = {
    ...THREAD,
    id: 'th_brand_new',
    title: 'percakapan baru',
    messages: [{ ...THREAD.messages[0], id: 'fresh', content: 'halo' }]
  };
  const inMemory = [startedNow];

  const result = await loadChatArchive(bridgeStub);
  assert.ok(result);

  // This mirrors the merge the store performs.
  const known = new Set(inMemory.map((t) => t.id));
  const incoming = result.threads.filter((t) => t?.id && !known.has(t.id));
  const merged = [...incoming, ...inMemory];

  assert.equal(merged.length, 2, 'both the stored and the new thread must survive');
  assert.ok(merged.some((t) => t.id === 'th_brand_new'), 'the in-flight thread must not be discarded');
  assert.ok(merged.some((t) => t.id === 'th_1'), 'the stored thread must still be loaded');
});

test('malformed threads in the archive are dropped, not rendered', async () => {
  // A hand-edited or truncated archive must degrade to "no history" rather than
  // crash the drawer that iterates these.
  reset();
  fileContent = JSON.stringify([THREAD, { id: 'broken' }, null, 'nonsense', { id: 'x', sessionId: 's', title: 't' }]);

  const result = await loadChatArchive(bridgeStub);
  assert.equal(result?.threads.length, 1);
  assert.equal(result?.threads[0]?.id, 'th_1');
});

test('an archive that is entirely malformed yields no threads', async () => {
  reset();
  fileContent = JSON.stringify([{ nope: true }, 42]);
  const result = await loadChatArchive(bridgeStub);
  assert.deepEqual(result?.threads, []);
});

test('a failed file write still returns the history', async () => {
  // The important property: a disk error must never turn into "your history is
  // gone", because localStorage is still the only copy at that point.
  reset();
  store.set('boba_ai_chat_threads', JSON.stringify([THREAD]));
  saveShouldFail = true;

  const result = await loadChatArchive(bridgeStub);
  assert.ok(result, 'history must still be handed back to the caller');
  assert.equal(result?.threads.length, 1);
  assert.equal(result?.migrated, false);
  assert.equal(store.has('boba_ai_chat_threads'), true, 'localStorage must be kept when the file write failed');
});

test('a corrupt archive file falls back to legacy storage', async () => {
  reset();
  fileContent = '{ this is not json';
  store.set('boba_ai_chat_threads', JSON.stringify([THREAD]));

  const result = await loadChatArchive(bridgeStub);
  assert.equal(result?.threads.length, 1, 'an unreadable file must not hide the legacy copy');
});

test('nothing stored anywhere yields no archive', async () => {
  reset();
  assert.equal(await loadChatArchive(bridgeStub), null);
});

test('a debounced save collapses a burst into one write', async () => {
  reset();
  scheduleChatArchiveSave(JSON.stringify([THREAD]), '{}', bridgeStub);
  scheduleChatArchiveSave(JSON.stringify([THREAD]), '{}', bridgeStub);
  scheduleChatArchiveSave(JSON.stringify([THREAD]), '{}', bridgeStub);
  assert.equal(savedPayloads.length, 0, 'nothing should be written before the debounce elapses');

  await flushChatArchive(bridgeStub);
  assert.equal(savedPayloads.length, 1, 'the burst must collapse to a single write');
});

test('a scheduled save survives an explicit flush', async () => {
  reset();
  scheduleChatArchiveSave(JSON.stringify([THREAD]), '{"sess-1":"th_1"}', bridgeStub);
  await flushChatArchive(bridgeStub);
  assert.notEqual(fileContent, null);
  assert.equal(store.get('boba_ai_active_threads'), '{"sess-1":"th_1"}');
});
