/** "Morning Workout", "Evening Workout"… — the default name for a quick start. */
export function defaultWorkoutName(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return "Night Workout";
  if (h < 12) return "Morning Workout";
  if (h < 17) return "Afternoon Workout";
  if (h < 21) return "Evening Workout";
  return "Night Workout";
}
