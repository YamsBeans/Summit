// The on-device store must survive an app restart / page reload: it holds all
// of a local-mode user's data and any workout logged with no signal.

const mockStore: Record<string, string> = {};
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn((k: string) => Promise.resolve(mockStore[k] ?? null)),
  setItem: jest.fn((k: string, v: string) => { mockStore[k] = v; return Promise.resolve(); }),
  removeItem: jest.fn((k: string) => { delete mockStore[k]; return Promise.resolve(); }),
}));

import {
  localDb,
  isLocalId,
  finishedLocalSessionIds,
  removeLocalSessions,
  LOCAL_ID_BASE,
  __resetLocalDbForTests,
} from "../backend/localDb";

const KEY = "@gym_tracker_local_db_v1";

// Simulate the app being killed and relaunched: memory is wiped, storage stays.
const restart = () => __resetLocalDbForTests();

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  restart();
});

async function signedInUser() {
  const { data } = await localDb.signUp("a@b.c", "pw", "alex");
  return data!.user.id;
}

it("keeps an unfinished workout and its sets across a restart", async () => {
  const userId = await signedInUser();
  const { data: session } = await localDb.startWorkoutSession({ routine_id: null, session_name: "Evening", user_id: userId });
  const { data: ex } = await localDb.insertSessionExercise({
    session_id: session!.session_id, exercise_id: "bench", exercise_name: "Bench", exercise_order: 1, notes: null,
  });
  const { data: set } = await localDb.insertSessionExerciseSet({
    session_exercise_id: ex!.session_exercise_id, set_number: 1, weight: 135, reps: 8, is_warmup: false,
  });
  await localDb.updateSessionExerciseSet(set!.session_set_id, { completed: true });

  restart();

  const { data: active } = await localDb.getActiveSession(userId);
  expect(active?.session_id).toBe(session!.session_id);
  const { data: exs } = await localDb.getSessionExercises(session!.session_id);
  expect(exs.map((e: any) => e.exercise_id)).toEqual(["bench"]);
  const { data: sets } = await localDb.getSessionExerciseSets(ex!.session_exercise_id);
  expect(sets[0]).toMatchObject({ weight: 135, reps: 8, completed: true });
});

it("stays signed in after a restart in local mode", async () => {
  const userId = await signedInUser();
  restart();
  const { data } = await localDb.getSession();
  expect(data.session?.user.id).toBe(userId);
});

it("hands out local IDs that never collide with server IDs or earlier rows", async () => {
  const userId = await signedInUser();
  const { data: a } = await localDb.startWorkoutSession({ routine_id: null, session_name: "A", user_id: userId });
  expect(isLocalId(a!.session_id)).toBe(true);
  expect(isLocalId(42)).toBe(false);
  expect(isLocalId(null)).toBe(false);

  restart();
  const { data: b } = await localDb.startWorkoutSession({ routine_id: null, session_name: "B", user_id: userId });
  expect(b!.session_id).toBeGreaterThan(a!.session_id);
});

it("never reuses an ID even if the saved counters are missing", async () => {
  const userId = await signedInUser();
  const { data: a } = await localDb.startWorkoutSession({ routine_id: null, session_name: "A", user_id: userId });
  const saved = JSON.parse(mockStore[KEY]);
  delete saved.ids;
  mockStore[KEY] = JSON.stringify(saved);

  restart();
  const { data: b } = await localDb.startWorkoutSession({ routine_id: null, session_name: "B", user_id: userId });
  expect(b!.session_id).toBe(a!.session_id + 1);
  expect(b!.session_id).toBeGreaterThan(LOCAL_ID_BASE);
});

it("removes finished workouts with their exercises and sets", async () => {
  const userId = await signedInUser();
  const { data: done } = await localDb.startWorkoutSession({ routine_id: null, session_name: "Done", user_id: userId });
  const { data: ex } = await localDb.insertSessionExercise({
    session_id: done!.session_id, exercise_id: "squat", exercise_name: "Squat", exercise_order: 1, notes: null,
  });
  await localDb.insertSessionExerciseSet({ session_exercise_id: ex!.session_exercise_id, set_number: 1, weight: 225, reps: 5, is_warmup: false });
  await localDb.finishWorkoutSession(done!.session_id, null);
  const { data: open } = await localDb.startWorkoutSession({ routine_id: null, session_name: "Open", user_id: userId });

  restart();
  const finished = await finishedLocalSessionIds();
  expect(finished).toEqual([done!.session_id]);
  await removeLocalSessions(finished);

  expect((await localDb.getWorkoutSession(done!.session_id)).data).toBeNull();
  expect((await localDb.getSessionExerciseSets(ex!.session_exercise_id)).data).toEqual([]);
  expect((await localDb.getActiveSession(userId)).data?.session_id).toBe(open!.session_id);

  // And the pruned state is what's saved.
  restart();
  expect((await localDb.getWorkoutSession(done!.session_id)).data).toBeNull();
});

it("starts empty on corrupt storage but keeps a copy of it", async () => {
  mockStore[KEY] = "{not json";
  const { data } = await localDb.getRoutines();
  expect(data).toEqual([]);
  const backup = Object.keys(mockStore).find((k) => k.startsWith(KEY + "_corrupt_"));
  expect(backup && mockStore[backup]).toBe("{not json");
});

it("never overwrites saved data it couldn't read", async () => {
  const userId = await signedInUser();
  await localDb.startWorkoutSession({ routine_id: null, session_name: "Keep me", user_id: userId });
  const saved = mockStore[KEY];

  restart();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AsyncStorage = require("@react-native-async-storage/async-storage");
  AsyncStorage.getItem.mockImplementationOnce(() => Promise.reject(new Error("storage unavailable")));
  await localDb.insertRoutine({ routine_name: "New", description: null, user_id: userId });
  expect(mockStore[KEY]).toBe(saved);
});
