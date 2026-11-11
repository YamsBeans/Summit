// Supabase (PostgREST) returns at most 1000 rows per request by default and
// says nothing when it cuts a result short. Long histories went past that:
// Profile's totals, Muscle Split and calendar silently stopped counting once
// a user had a few hundred logged sets. These helpers read every row.

export type RowsResult = { data: any[] | null; error: any };

/** PostgREST's default `max-rows`. A page shorter than this is the last one. */
export const PAGE_SIZE = 1000;

/** Short `.in()` lists keep URLs small and each request well under one page. */
export const IN_CHUNK = 40;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Reads page after page until a short page. `page(from, to)` should be the
 * query with `.range(from, to)` and an order that ends on a unique column,
 * so rows can't shift between pages.
 */
export async function fetchAllPages(
  page: (from: number, to: number) => PromiseLike<RowsResult>,
  pageSize = PAGE_SIZE,
): Promise<RowsResult> {
  const rows: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const list = data ?? [];
    rows.push(...list);
    if (list.length < pageSize) return { data: rows, error: null };
  }
}

/**
 * Runs `query` for each chunk of `ids` (in parallel) and every page of each
 * chunk. Any error fails the whole read, so callers never see a partial list.
 */
export async function fetchInChunks<T>(
  ids: T[],
  query: (chunkIds: T[], from: number, to: number) => PromiseLike<RowsResult>,
  chunkSize = IN_CHUNK,
): Promise<RowsResult> {
  if (ids.length === 0) return { data: [], error: null };
  const results = await Promise.all(
    chunk(ids, chunkSize).map((c) => fetchAllPages((from, to) => query(c, from, to))),
  );
  const failed = results.find((r) => r.error);
  if (failed) return { data: null, error: failed.error };
  return { data: results.flatMap((r) => r.data ?? []), error: null };
}
