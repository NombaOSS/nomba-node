import type { CursorPage } from "../types.js";

/**
 * Iterate every item across cursor pages. Stops when the cursor is empty or
 * absent, a page has no results, or the server repeats a cursor.
 */
export async function* autoPage<T>(
  fetchPage: (cursor: string | undefined) => Promise<CursorPage<T> | null | undefined>,
  startCursor?: string
): AsyncGenerator<T, void, undefined> {
  let cursor = startCursor;
  const seen = new Set<string>();
  for (;;) {
    const page = await fetchPage(cursor);
    const results = page?.results ?? [];
    for (const item of results) yield item;
    const next = page?.cursor;
    if (!next || results.length === 0 || seen.has(next)) return;
    seen.add(next);
    cursor = next;
  }
}
