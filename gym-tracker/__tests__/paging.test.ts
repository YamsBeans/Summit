import { chunk, fetchAllPages, fetchInChunks } from "../backend/paging";

const rows = (n: number, start = 0) => Array.from({ length: n }, (_, i) => ({ id: start + i }));

describe("chunk", () => {
  it("splits into fixed-size pieces", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe("fetchAllPages", () => {
  it("keeps reading while pages are full", async () => {
    const all = rows(2500);
    const calls: [number, number][] = [];
    const res = await fetchAllPages(async (from, to) => {
      calls.push([from, to]);
      return { data: all.slice(from, to + 1), error: null };
    });
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(2500);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("makes one extra request when the total is an exact multiple", async () => {
    const all = rows(1000);
    const page = jest.fn(async (from: number, to: number) => ({ data: all.slice(from, to + 1), error: null }));
    const res = await fetchAllPages(page);
    expect(res.data).toHaveLength(1000);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it("returns the error, never a partial list", async () => {
    const res = await fetchAllPages(async (from) =>
      from === 0 ? { data: rows(1000), error: null } : { data: null, error: { message: "boom" } });
    expect(res).toEqual({ data: null, error: { message: "boom" } });
  });

  it("treats null data as an empty last page", async () => {
    expect(await fetchAllPages(async () => ({ data: null, error: null }))).toEqual({ data: [], error: null });
  });
});

describe("fetchInChunks", () => {
  it("queries each chunk and joins the rows", async () => {
    const ids = Array.from({ length: 95 }, (_, i) => i);
    const seen: number[][] = [];
    const res = await fetchInChunks(ids, async (c) => {
      seen.push(c);
      return { data: c.map((id) => ({ id })), error: null };
    });
    expect(seen.map((c) => c.length)).toEqual([40, 40, 15]);
    expect(res.data?.map((r) => r.id)).toEqual(ids);
  });

  it("pages within a chunk that has more than 1000 rows", async () => {
    const res = await fetchInChunks([1], async (_c, from, to) => ({ data: rows(1500).slice(from, to + 1), error: null }));
    expect(res.data).toHaveLength(1500);
  });

  it("fails the whole read if one chunk fails", async () => {
    const res = await fetchInChunks([1, 2, 3], async (c) =>
      c.includes(3) ? { data: null, error: { message: "nope" } } : { data: [{ id: 1 }], error: null }, 2);
    expect(res).toEqual({ data: null, error: { message: "nope" } });
  });

  it("skips the network for an empty id list", async () => {
    const q = jest.fn();
    expect(await fetchInChunks([], q)).toEqual({ data: [], error: null });
    expect(q).not.toHaveBeenCalled();
  });
});
