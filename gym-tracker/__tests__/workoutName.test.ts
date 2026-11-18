import { defaultWorkoutName } from "../utils/workoutName";

const at = (h: number) => new Date(2026, 9, 28, h, 15);

describe("defaultWorkoutName", () => {
  it("names quick-start workouts by time of day", () => {
    expect(defaultWorkoutName(at(6))).toBe("Morning Workout");
    expect(defaultWorkoutName(at(13))).toBe("Afternoon Workout");
    expect(defaultWorkoutName(at(18))).toBe("Evening Workout");
    expect(defaultWorkoutName(at(23))).toBe("Night Workout");
    expect(defaultWorkoutName(at(2))).toBe("Night Workout");
  });
});
