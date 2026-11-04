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
