/**
 * Durable local state that lives outside the vault.
 *
 * AI chat history used to be written to `localStorage`, where it shared a 5 MB
 * origin quota with the encrypted vault. A single long tool result was enough
 * to fill that quota, after which every other write in the app threw.
 *
 * It now lives in its own JSON file under the app data directory, written
 * atomically by the Rust side. It is deliberately not part of the vault and is
 * never uploaded to cloud sync.
 */

// `.ts` extensions: this module is loaded by the Node test runner, which
// resolves real paths and cannot follow bundler-style extensionless imports.
import { safeGetItem, safeRemoveItem } from './safeStorage.ts';

interface StoredMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: number;
}

interface StoredThread {
  id: string;
  sessionId: string;
  title: string;
  messages: StoredMessage[];
  createdAt: number;
  updatedAt: number;
}

const CHAT_ARCHIVE_FILE = 'ai/chat-archive.json';
const LEGACY_THREADS_KEY = 'boba_ai_chat_threads';
const LEGACY_HISTORY_KEY = 'boba_ai_chat_history';
const LEGACY_ACTIVE_KEY = 'boba_ai_active_threads';

/** Writes are debounced: `saveState` runs on every streamed token. */
const SAVE_DEBOUNCE_MS = 800;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPayload: { threads: string; active: string; bridge?: LocalStateBridge } | null = null;

export interface LoadedArchive {
  threads: StoredThread[];
  active: string;
  migrated: boolean;
}

/**
 * The slice of the Tauri bridge this module needs.
 *
 * Passed in rather than imported directly so the migration rules can be tested
 * without a running Tauri runtime.
 */
/**
 * The slice of the Tauri bridge this module needs.
 *
 * Resolved lazily instead of imported at the top level: the Tauri API is only
 * available inside the desktop runtime, and a static import would make this
 * module unloadable anywhere else (including the test runner).
 */
export interface LocalStateBridge {
  localStateLoad(relative: string): Promise<string>;
  localStateSave(relative: string, content: string): Promise<void>;
}

async function resolveBridge(bridge?: LocalStateBridge): Promise<LocalStateBridge> {
  if (bridge) return bridge;
  const mod = await import('../services/tauriBridge');
  return mod.tauriBridge;
}


/**
 * Rebuild threads from the pre-thread `sessionId -> messages` format.
 *
 * Installs that predate the thread model only have `boba_ai_chat_history`.
 * Without this the old conversations would silently disappear on upgrade.
 */
function threadsFromLegacyHistory(raw: string): StoredThread[] | null {
  try {
    const legacy = JSON.parse(raw) as Record<string, StoredMessage[]>;
    if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return null;
    const out: StoredThread[] = [];
    for (const [sid, msgs] of Object.entries(legacy)) {
      if (!Array.isArray(msgs) || msgs.length === 0) continue;
      const firstUser = msgs.find((m) => m?.role === 'user');
      const title = firstUser?.content
        ? firstUser.content.slice(0, 36) + (firstUser.content.length > 36 ? '...' : '')
        : 'Percakapan Sebelumnya';
      out.push({
        id: `th_${sid}_${Date.now()}`,
        sessionId: sid,
        title,
        messages: msgs,
        createdAt: msgs[0]?.createdAt || Date.now(),
        updatedAt: msgs[msgs.length - 1]?.createdAt || Date.now()
      });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/**
 * A thread has to look like a thread before the drawer is allowed to touch it.
 * The archive is a plain JSON file on disk, so a truncated or hand-edited one
 * must degrade to "no history" rather than crash the panel that renders it.
 */
function isUsableThread(t: unknown): t is StoredThread {
  if (!t || typeof t !== 'object') return false;
  const thread = t as Partial<StoredThread>;
  return (
    typeof thread.id === 'string' &&
    typeof thread.sessionId === 'string' &&
    typeof thread.title === 'string' &&
    Array.isArray(thread.messages)
  );
}

function parseThreads(raw: string): StoredThread[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const usable = parsed.filter(isUsableThread);
    if (!usable.length && parsed.length) {
      console.warn(`BOBA: dropped ${parsed.length} malformed chat thread(s) from the archive.`);
    }
    return usable;
  } catch {
    return null;
  }
}

export async function loadChatArchive(bridge?: LocalStateBridge): Promise<LoadedArchive | null> {
  const store = await resolveBridge(bridge);
  const active = safeGetItem(LEGACY_ACTIVE_KEY) ?? '{}';

  // 1. The archive file wins whenever it exists.
  try {
    const raw = await store.localStateLoad(CHAT_ARCHIVE_FILE);
    if (raw) {
      const parsed = parseThreads(raw);
      if (parsed) return { threads: parsed, active, migrated: false };
      console.warn('BOBA: chat archive file was not a thread list, ignoring it.');
    }
  } catch (err) {
    console.warn('BOBA: could not read the chat archive file.', err);
  }

  // 2. Otherwise adopt whatever older builds left in localStorage.
  const legacyThreads = safeGetItem(LEGACY_THREADS_KEY);
  const legacyHistory = legacyThreads ? null : safeGetItem(LEGACY_HISTORY_KEY);
  if (!legacyThreads && !legacyHistory) return null;

  const source = legacyThreads
    ? parseThreads(legacyThreads)
    : threadsFromLegacyHistory(legacyHistory as string);
  if (!source || source.length === 0) return null;

  try {
    await store.localStateSave(CHAT_ARCHIVE_FILE, JSON.stringify(source));
    // Only now is it safe to drop the old copies: the file write succeeded.
    safeRemoveItem(LEGACY_THREADS_KEY);
    safeRemoveItem(LEGACY_HISTORY_KEY);
    console.info(`BOBA: migrated ${source.length} chat thread(s) from localStorage to a local file.`);
    return { threads: source, active, migrated: true };
  } catch (err) {
    // The file write failed, so localStorage is still the only copy. Hand the
    // history back rather than showing an empty drawer.
    console.warn('BOBA: chat history migration failed; reading from localStorage instead.', err);
    return { threads: source, active, migrated: false };
  }
}

/** Queue a debounced write. Safe to call as often as every token. */
export function scheduleChatArchiveSave(threadsJson: string, activeJson: string, bridge?: LocalStateBridge): void {
  pendingPayload = { threads: threadsJson, active: activeJson, bridge };
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void flushChatArchive(bridge);
  }, SAVE_DEBOUNCE_MS);
}

/** Write immediately, cancelling any queued write. */
export async function flushChatArchive(bridge?: LocalStateBridge): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const payload = pendingPayload;
  pendingPayload = null;
  if (!payload) return;
  try {
    const store = await resolveBridge(bridge ?? payload.bridge);
    await store.localStateSave(CHAT_ARCHIVE_FILE, payload.threads);
    // Active-thread pointers are tiny; localStorage is fine for them and keeps
    // thread switching correct even if the archive write is still in flight.
    try {
      localStorage.setItem(LEGACY_ACTIVE_KEY, payload.active);
    } catch {
      /* quota pressure: not worth failing the save over */
    }
  } catch (err) {
    console.warn('BOBA: could not write the chat archive file.', err);
  }
}
