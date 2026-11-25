// Quick rest-timer changes must leave exactly one notification, and a Skip
// must win over a schedule that was still waiting.

let mockNext = 1;
const mockScheduled = new Set<string>();
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
  scheduleNotificationAsync: jest.fn(async () => {
    await new Promise((r) => setTimeout(r, 5));
    const id = `n${mockNext++}`;
    mockScheduled.add(id);
    return id;
  }),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => { mockScheduled.delete(id); }),
}));
jest.mock("expo-device", () => ({ isDevice: true }));

import { beginRestNotification, cancelRestDoneNotification, scheduleRestDoneNotification } from "@/utils/notifications";

beforeEach(async () => {
  await cancelRestDoneNotification();
  mockScheduled.clear();
});

it("two quick adjustments leave one notification", async () => {
  await Promise.all([scheduleRestDoneNotification(90), scheduleRestDoneNotification(120)]);
  expect(mockScheduled.size).toBe(1);
});

it("a skip before the delayed schedule wins", async () => {
  const token = beginRestNotification();
  await cancelRestDoneNotification(); // user hits Skip
  await scheduleRestDoneNotification(90, token); // settings read resolves late
  expect(mockScheduled.size).toBe(0);
});

it("a skip while scheduling cancels the new one", async () => {
  const p = scheduleRestDoneNotification(90);
  const c = cancelRestDoneNotification();
  await Promise.all([p, c]);
  expect(mockScheduled.size).toBe(0);
});
