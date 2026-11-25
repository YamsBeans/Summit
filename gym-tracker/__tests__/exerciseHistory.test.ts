import { mergeSameSession } from "../utils/exerciseHistory";

it("merges blocks of the same workout into one session, sets in order", () => {
  const merged = mergeSameSession([
    { session_id: 1, session_date: "2026-11-17", sets: [{ weight: 225 }] },
    { session_id: 1, session_date: "2026-11-17", sets: [{ weight: 175 }, { weight: 175 }] },
    { session_id: 2, session_date: "2026-11-23", sets: [{ weight: 230 }] },
  ]);
  expect(merged.map((h) => [h.session_id, h.sets.map((s) => s.weight)])).toEqual([
    [1, [225, 175, 175]],
    [2, [230]],
  ]);
});

it("doesn't change its input and keeps entries without an id apart", () => {
  const input = [
    { session_id: null, session_date: "2026-11-01", sets: [{ weight: 1 }] },
    { session_id: null, session_date: "2026-11-01", sets: [{ weight: 2 }] },
  ];
  expect(mergeSameSession(input)).toHaveLength(2);
  const one = [{ session_id: 5, session_date: "d", sets: [{ weight: 1 }] }, { session_id: 5, session_date: "d", sets: [{ weight: 2 }] }];
  mergeSameSession(one);
  expect(one[0].sets).toHaveLength(1);
});
