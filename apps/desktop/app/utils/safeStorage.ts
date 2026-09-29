/**
 * localStorage helpers that never throw.
 *
 * Every preference in this app is a nice-to-have. When the origin hits its
 * quota a bare `setItem` throws a QuotaExceededError into whatever event handler
 * wrote it, so collapsing one sidebar folder could crash the click and take
 * unrelated state down with it. Failing quietly is the correct behaviour here:
 * the alternative is the user losing the whole session to a preference.
 */

export function safeSetItem(key: string, value: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeRemoveItem(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Rough byte size of a string as UTF-16, which is how WebView2 accounts for it. */
export function byteSize(value: string): number {
  return value.length * 2;
}

/**
 * Approximate total bytes currently held by `boba_*` keys. Used to report how
 * close the origin is to its quota instead of failing mysteriously.
 */
export function usedBytes(): number {
  try {
    if (typeof localStorage === 'undefined') return 0;
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      total += byteSize(key) + byteSize(localStorage.getItem(key) ?? '');
    }
    return total;
  } catch {
    return 0;
  }
}
