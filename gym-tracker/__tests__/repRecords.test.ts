import { buildRepRecords } from "@/utils/repRecords";

describe("buildRepRecords", () => {
  it("keeps the heaviest weight per rep count and drops dominated ones", () => {
    const rows = buildRepRecords([
      { session_date: "2026-10-01", sets: [{ weight: 185, reps: 5 }, { weight: 225, reps: 1 }, { weight: 95, reps: 10, is_warmup: true }] },
      { session_date: "2026-10-08", sets: [{ weight: 200, reps: 5 }, { weight: 190, reps: 3 }, { weight: 155, reps: 10 }] },
      { session_date: "2026-10-15", sets: [{ weight: 200, reps: 5 }, { weight: 300, reps: 20 }, { weight: 0, reps: 8 }] },
    ]);
    expect(rows).toEqual([
      { reps: 1, weight: 225, date: "2026-10-01" },
      { reps: 5, weight: 200, date: "2026-10-08" },
      { reps: 10, weight: 155, date: "2026-10-08" },
    ]);
  });

  it("ignores unticked sets", () => {
    expect(buildRepRecords([{ session_date: "2026-10-01", sets: [{ weight: 500, reps: 1, completed: false }] }])).toEqual([]);
  });
});
