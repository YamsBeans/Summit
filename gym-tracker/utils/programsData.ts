export type ProgramExercise = {
  exercise_id: string;
  exercise_name: string;
  sets: number;
  reps: number;
};

export type ProgramRoutine = {
  name: string;
  exercises: ProgramExercise[];
};

export type Program = {
  id: string;
  name: string;
  description: string;
  level: 'beginner' | 'intermediate';
  goal: 'strength' | 'hypertrophy' | 'weight_loss';
  equipment: 'gym' | 'home';
  label: string;
  labelColor: string;
  routines: ProgramRoutine[];
};

export const PROGRAMS: Program[] = [
  {
    id: 'beginner_ppl',
    name: 'Beginner Push/Pull/Legs',
    description: '3-day split targeting every muscle group twice per week. Perfect for building your first solid foundation.',
    level: 'beginner',
    goal: 'hypertrophy',
    equipment: 'gym',
    label: 'PUSH\nPULL\nLEGS',
    labelColor: '#5046e5',
    routines: [
      {
        name: 'Push Day',
        exercises: [
          { exercise_id: 'Barbell_Bench_Press_-_Medium_Grip', exercise_name: 'Barbell Bench Press', sets: 4, reps: 8 },
          { exercise_id: 'Barbell_Incline_Bench_Press_-_Medium_Grip', exercise_name: 'Incline Bench Press', sets: 3, reps: 10 },
          { exercise_id: 'Barbell_Shoulder_Press', exercise_name: 'Barbell Shoulder Press', sets: 3, reps: 10 },
          { exercise_id: 'Triceps_Pushdown', exercise_name: 'Triceps Pushdown', sets: 3, reps: 12 },
          { exercise_id: 'One-Arm_Side_Laterals', exercise_name: 'Dumbbell Lateral Raises', sets: 3, reps: 15 },
        ],
      },
      {
        name: 'Pull Day',
        exercises: [
          { exercise_id: 'Wide-Grip_Lat_Pulldown', exercise_name: 'Wide-Grip Lat Pulldown', sets: 4, reps: 10 },
          { exercise_id: 'Seated_Cable_Rows', exercise_name: 'Seated Cable Row', sets: 3, reps: 10 },
          { exercise_id: 'Face_Pull', exercise_name: 'Face Pull', sets: 3, reps: 15 },
          { exercise_id: 'Dumbbell_Bicep_Curl', exercise_name: 'Dumbbell Bicep Curl', sets: 3, reps: 12 },
          { exercise_id: 'Alternate_Hammer_Curl', exercise_name: 'Hammer Curl', sets: 3, reps: 12 },
        ],
      },
      {
        name: 'Leg Day',
        exercises: [
          { exercise_id: 'Barbell_Full_Squat', exercise_name: 'Barbell Squat', sets: 4, reps: 8 },
          { exercise_id: 'Leg_Press', exercise_name: 'Leg Press', sets: 3, reps: 10 },
          { exercise_id: 'Romanian_Deadlift', exercise_name: 'Romanian Deadlift', sets: 3, reps: 10 },
          { exercise_id: 'Lying_Leg_Curls', exercise_name: 'Lying Leg Curl', sets: 3, reps: 12 },
          { exercise_id: 'Standing_Calf_Raises', exercise_name: 'Standing Calf Raise', sets: 4, reps: 15 },
        ],
      },
    ],
  },
  {
    id: 'intermediate_ppl',
    name: 'Intermediate Push/Pull/Legs',
    description: 'Run 6 days per week (PPL PPL) with higher volume and heavier loading. Best for those with 6+ months of consistent training.',
    level: 'intermediate',
    goal: 'hypertrophy',
    equipment: 'gym',
    label: 'PUSH\nPULL\nLEGS',
    labelColor: '#5046e5',
    routines: [
      {
        name: 'Push Day',
        exercises: [
          { exercise_id: 'Barbell_Bench_Press_-_Medium_Grip', exercise_name: 'Barbell Bench Press', sets: 4, reps: 5 },
          { exercise_id: 'Barbell_Incline_Bench_Press_-_Medium_Grip', exercise_name: 'Incline Bench Press', sets: 4, reps: 8 },
          { exercise_id: 'Barbell_Shoulder_Press', exercise_name: 'Barbell Shoulder Press', sets: 3, reps: 8 },
          { exercise_id: 'Dips_-_Triceps_Version', exercise_name: 'Tricep Dips', sets: 3, reps: 10 },
          { exercise_id: 'Triceps_Pushdown', exercise_name: 'Triceps Pushdown', sets: 3, reps: 12 },
          { exercise_id: 'One-Arm_Side_Laterals', exercise_name: 'Lateral Raises', sets: 4, reps: 15 },
        ],
      },
      {
        name: 'Pull Day',
        exercises: [
          { exercise_id: 'Barbell_Deadlift', exercise_name: 'Deadlift', sets: 4, reps: 5 },
          { exercise_id: 'Bent_Over_Barbell_Row', exercise_name: 'Bent Over Barbell Row', sets: 4, reps: 6 },
          { exercise_id: 'Wide-Grip_Lat_Pulldown', exercise_name: 'Wide-Grip Lat Pulldown', sets: 3, reps: 8 },
          { exercise_id: 'Face_Pull', exercise_name: 'Face Pull', sets: 3, reps: 15 },
          { exercise_id: 'Barbell_Curl', exercise_name: 'Barbell Curl', sets: 3, reps: 10 },
          { exercise_id: 'Alternate_Hammer_Curl', exercise_name: 'Hammer Curl', sets: 3, reps: 12 },
        ],
      },
      {
        name: 'Leg Day',
        exercises: [
          { exercise_id: 'Barbell_Full_Squat', exercise_name: 'Barbell Squat', sets: 4, reps: 5 },
          { exercise_id: 'Romanian_Deadlift', exercise_name: 'Romanian Deadlift', sets: 3, reps: 8 },
          { exercise_id: 'Leg_Press', exercise_name: 'Leg Press', sets: 3, reps: 10 },
          { exercise_id: 'Lying_Leg_Curls', exercise_name: 'Lying Leg Curl', sets: 3, reps: 12 },
          { exercise_id: 'Leg_Extensions', exercise_name: 'Leg Extension', sets: 3, reps: 12 },
          { exercise_id: 'Standing_Calf_Raises', exercise_name: 'Standing Calf Raise', sets: 4, reps: 15 },
        ],
      },
    ],
  },
  {
    id: 'beginner_full_body',
    name: 'Beginner Full-Body',
    description: '3-day full-body program training every major muscle group each session. Great for building strength and coordination quickly.',
    level: 'beginner',
    goal: 'strength',
    equipment: 'gym',
    label: 'FULL\nBODY',
    labelColor: '#16a34a',
    routines: [
      {
        name: 'Full Body A',
        exercises: [
          { exercise_id: 'Barbell_Full_Squat', exercise_name: 'Barbell Squat', sets: 3, reps: 8 },
          { exercise_id: 'Barbell_Bench_Press_-_Medium_Grip', exercise_name: 'Barbell Bench Press', sets: 3, reps: 8 },
          { exercise_id: 'Bent_Over_Barbell_Row', exercise_name: 'Bent Over Barbell Row', sets: 3, reps: 8 },
          { exercise_id: 'Barbell_Shoulder_Press', exercise_name: 'Barbell Shoulder Press', sets: 3, reps: 10 },
          { exercise_id: 'Dumbbell_Bicep_Curl', exercise_name: 'Dumbbell Bicep Curl', sets: 2, reps: 12 },
        ],
      },
      {
        name: 'Full Body B',
        exercises: [
          { exercise_id: 'Barbell_Deadlift', exercise_name: 'Deadlift', sets: 3, reps: 6 },
          { exercise_id: 'Barbell_Incline_Bench_Press_-_Medium_Grip', exercise_name: 'Incline Bench Press', sets: 3, reps: 10 },
          { exercise_id: 'Wide-Grip_Lat_Pulldown', exercise_name: 'Wide-Grip Lat Pulldown', sets: 3, reps: 10 },
          { exercise_id: 'Leg_Press', exercise_name: 'Leg Press', sets: 3, reps: 10 },
          { exercise_id: 'Triceps_Pushdown', exercise_name: 'Triceps Pushdown', sets: 2, reps: 12 },
        ],
      },
      {
        name: 'Full Body C',
        exercises: [
          { exercise_id: 'Barbell_Full_Squat', exercise_name: 'Barbell Squat', sets: 3, reps: 8 },
          { exercise_id: 'One-Arm_Dumbbell_Row', exercise_name: 'Dumbbell Row', sets: 3, reps: 10 },
          { exercise_id: 'Barbell_Shoulder_Press', exercise_name: 'Barbell Shoulder Press', sets: 3, reps: 10 },
          { exercise_id: 'Romanian_Deadlift', exercise_name: 'Romanian Deadlift', sets: 3, reps: 10 },
          { exercise_id: 'Face_Pull', exercise_name: 'Face Pull', sets: 3, reps: 15 },
        ],
      },
    ],
  },
  {
    id: 'intermediate_upper_lower',
    name: 'Intermediate Upper/Lower',
    description: '4-day upper/lower split with a strength day and a hypertrophy day for each. Ideal for intermediate lifters chasing size and strength together.',
    level: 'intermediate',
    goal: 'strength',
    equipment: 'gym',
    label: 'UPPER\nLOWER',
    labelColor: '#d97706',
    routines: [
      {
        name: 'Upper — Strength',
        exercises: [
          { exercise_id: 'Barbell_Bench_Press_-_Medium_Grip', exercise_name: 'Barbell Bench Press', sets: 4, reps: 5 },
          { exercise_id: 'Bent_Over_Barbell_Row', exercise_name: 'Bent Over Barbell Row', sets: 4, reps: 5 },
          { exercise_id: 'Barbell_Shoulder_Press', exercise_name: 'Barbell Shoulder Press', sets: 3, reps: 6 },
          { exercise_id: 'Wide-Grip_Lat_Pulldown', exercise_name: 'Wide-Grip Lat Pulldown', sets: 3, reps: 8 },
          { exercise_id: 'Barbell_Curl', exercise_name: 'Barbell Curl', sets: 3, reps: 8 },
        ],
      },
      {
        name: 'Lower — Strength',
        exercises: [
          { exercise_id: 'Barbell_Full_Squat', exercise_name: 'Barbell Squat', sets: 4, reps: 5 },
          { exercise_id: 'Barbell_Deadlift', exercise_name: 'Deadlift', sets: 3, reps: 5 },
          { exercise_id: 'Leg_Press', exercise_name: 'Leg Press', sets: 3, reps: 8 },
          { exercise_id: 'Lying_Leg_Curls', exercise_name: 'Lying Leg Curl', sets: 3, reps: 10 },
          { exercise_id: 'Standing_Calf_Raises', exercise_name: 'Standing Calf Raise', sets: 4, reps: 12 },
        ],
      },
      {
        name: 'Upper — Hypertrophy',
        exercises: [
          { exercise_id: 'Barbell_Incline_Bench_Press_-_Medium_Grip', exercise_name: 'Incline Bench Press', sets: 4, reps: 10 },
          { exercise_id: 'Seated_Cable_Rows', exercise_name: 'Seated Cable Row', sets: 4, reps: 10 },
          { exercise_id: 'Dumbbell_Bicep_Curl', exercise_name: 'Dumbbell Bicep Curl', sets: 3, reps: 12 },
          { exercise_id: 'Triceps_Pushdown', exercise_name: 'Triceps Pushdown', sets: 3, reps: 12 },
          { exercise_id: 'Face_Pull', exercise_name: 'Face Pull', sets: 3, reps: 15 },
          { exercise_id: 'One-Arm_Side_Laterals', exercise_name: 'Lateral Raises', sets: 3, reps: 15 },
        ],
      },
      {
        name: 'Lower — Hypertrophy',
        exercises: [
          { exercise_id: 'Romanian_Deadlift', exercise_name: 'Romanian Deadlift', sets: 4, reps: 10 },
          { exercise_id: 'Leg_Press', exercise_name: 'Leg Press', sets: 4, reps: 12 },
          { exercise_id: 'Leg_Extensions', exercise_name: 'Leg Extension', sets: 3, reps: 15 },
          { exercise_id: 'Lying_Leg_Curls', exercise_name: 'Lying Leg Curl', sets: 3, reps: 15 },
          { exercise_id: 'Standing_Calf_Raises', exercise_name: 'Standing Calf Raise', sets: 4, reps: 15 },
        ],
      },
    ],
  },
  {
    id: 'beginner_home',
    name: 'Beginner Full-Body (Equipment-Free)',
    description: 'No gym, no problem. Build strength and endurance using only your bodyweight. Great for beginners training at home.',
    level: 'beginner',
    goal: 'weight_loss',
    equipment: 'home',
    label: 'FULL\nBODY',
    labelColor: '#0d9460',
    routines: [
      {
        name: 'Bodyweight A',
        exercises: [
          { exercise_id: 'Bodyweight_Squat', exercise_name: 'Bodyweight Squat', sets: 3, reps: 15 },
          { exercise_id: 'Incline_Push-Up', exercise_name: 'Push-Up', sets: 3, reps: 10 },
          { exercise_id: 'Chin-Up', exercise_name: 'Chin-Up', sets: 3, reps: 6 },
          { exercise_id: 'Single_Leg_Glute_Bridge', exercise_name: 'Glute Bridge', sets: 3, reps: 15 },
          { exercise_id: 'Plank', exercise_name: 'Plank', sets: 3, reps: 30 },
        ],
      },
      {
        name: 'Bodyweight B',
        exercises: [
          { exercise_id: 'Bodyweight_Walking_Lunge', exercise_name: 'Walking Lunge', sets: 3, reps: 12 },
          { exercise_id: 'Decline_Push-Up', exercise_name: 'Decline Push-Up', sets: 3, reps: 10 },
          { exercise_id: 'Wide-Grip_Rear_Pull-Up', exercise_name: 'Wide-Grip Pull-Up', sets: 3, reps: 5 },
          { exercise_id: 'Bench_Dips', exercise_name: 'Tricep Dip', sets: 3, reps: 12 },
          { exercise_id: 'Barbell_Glute_Bridge', exercise_name: 'Glute Bridge', sets: 3, reps: 15 },
        ],
      },
      {
        name: 'Bodyweight C',
        exercises: [
          { exercise_id: 'Bodyweight_Squat', exercise_name: 'Bodyweight Squat', sets: 4, reps: 20 },
          { exercise_id: 'Incline_Push-Up', exercise_name: 'Push-Up', sets: 4, reps: 12 },
          { exercise_id: 'Chin-Up', exercise_name: 'Chin-Up', sets: 3, reps: 8 },
          { exercise_id: 'Bodyweight_Walking_Lunge', exercise_name: 'Walking Lunge', sets: 3, reps: 15 },
          { exercise_id: 'Plank', exercise_name: 'Plank', sets: 3, reps: 45 },
        ],
      },
    ],
  },
];
