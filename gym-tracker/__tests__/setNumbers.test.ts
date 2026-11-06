import { nextSetNumber, renumberChanges, workingSetNumber } from "@/utils/setNumbers";

describe("set numbers", () => {
  it("appends after the highest number, not the count", () => {
    expect(nextSetNumber([{ set_number: 1 }, { set_number: 3 }])).toBe(4);
    expect(nextSetNumber([])).toBe(1);
  });

  it("closes gaps after a delete", () => {
    const sets = [{ id: "a", set_number: 1 }, { id: "c", set_number: 3 }, { id: "d", set_number: 4 }];
    expect(renumberChanges(sets).map((c) => [c.set.id, c.set_number])).toEqual([["c", 2], ["d", 3]]);
    expect(renumberChanges([{ set_number: 1 }, { set_number: 2 }])).toEqual([]);
  });

  it("numbers working sets after warm-ups", () => {
    const sets = [{ is_warmup: true }, { is_warmup: false }, { is_warmup: true }, { is_warmup: false }];
    expect(sets.map((_, i) => workingSetNumber(sets, i))).toEqual([null, 1, null, 2]);
  });
});

describe("createSerialQueue", () => {
  it("runs jobs for the same key in order, even when one fails", async () => {
    const { createSerialQueue } = require("@/utils/setNumbers");
    const run = createSerialQueue();
    const log: string[] = [];
    const slow = run(1, async () => { await new Promise((r) => setTimeout(r, 20)); log.push("a"); throw new Error("x"); });
    const fast = run(1, async () => { log.push("b"); });
    await expect(slow).rejects.toThrow("x");
    await fast;
    expect(log).toEqual(["a", "b"]);
  });
});
