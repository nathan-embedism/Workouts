import type { WorkoutPlan } from '../types'

function isoDaysFromNow(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

/** A small plan so the app can be explored before an AI tool has written one. */
export function demoPlan(): WorkoutPlan {
  return {
    schemaVersion: 1,
    planName: 'Demo — Upper / Lower',
    goal: 'A sample plan to try the app out',
    units: 'kg',
    durationWeeks: 4,
    daysPerWeek: 3,
    notes: 'This is a demo. Add 2.5 kg when you hit the top of the rep range on every set.',
    events: [{ name: 'Charity 10k', date: isoDaysFromNow(56), notes: 'Keep the legs fresh the week before.' }],
    days: [
      {
        id: 'demo-d1',
        dayNumber: 1,
        name: 'Upper Push',
        weekday: 'Monday',
        type: 'strength',
        focus: ['chest', 'shoulders', 'triceps'],
        estimatedMinutes: 45,
        blocks: [
          {
            id: 'demo-d1b1',
            kind: 'single',
            restAfterBlockSeconds: 120,
            exercises: [
              {
                id: 'demo-d1b1e1',
                name: 'Barbell Bench Press',
                modality: 'weights',
                equipment: 'Flat bench + barbell',
                machineSettings: ['bench position'],
                cues: 'Shoulder blades down and back, bar to lower chest.',
                trackingFields: ['weight', 'reps'],
                sets: [
                  { type: 'warmup', reps: 10, targetWeight: 20, restSeconds: 60 },
                  { type: 'working', repRange: [6, 8], targetWeight: 60, rpeTarget: 8, restSeconds: 120 },
                  { type: 'working', repRange: [6, 8], targetWeight: 60, rpeTarget: 8, restSeconds: 120 },
                  { type: 'working', repRange: [6, 8], targetWeight: 60, rpeTarget: 9, restSeconds: 120 },
                ],
              },
            ],
          },
          {
            id: 'demo-d1b2',
            kind: 'superset',
            name: 'Shoulders + triceps',
            rounds: 3,
            restBetweenExercisesSeconds: 15,
            restAfterBlockSeconds: 90,
            exercises: [
              {
                id: 'demo-d1b2e1',
                name: 'Dumbbell Shoulder Press',
                modality: 'weights',
                equipment: 'Dumbbells',
                trackingFields: ['weight', 'reps'],
                sets: [
                  { type: 'working', repRange: [8, 12], targetWeight: 16, rpeTarget: 8 },
                  { type: 'working', repRange: [8, 12], targetWeight: 16, rpeTarget: 8 },
                  { type: 'working', repRange: [8, 12], targetWeight: 16, rpeTarget: 9 },
                ],
              },
              {
                id: 'demo-d1b2e2',
                name: 'Cable Triceps Pushdown',
                modality: 'weights',
                equipment: 'Cable machine',
                machineSettings: ['pulley height'],
                trackingFields: ['weight', 'reps'],
                sets: [
                  { type: 'working', reps: 12, targetWeight: 25 },
                  { type: 'working', reps: 12, targetWeight: 25 },
                  {
                    type: 'working', reps: 12, targetWeight: 25,
                    drops: [{ weightPercent: 70, reps: 10 }, { weightPercent: 50, toFailure: true }],
                    notes: 'Final set: strip the stack twice, no rest between drops.',
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'demo-d2',
        dayNumber: 2,
        name: 'Rest',
        weekday: 'Tuesday',
        type: 'rest',
        blocks: [],
      },
      {
        id: 'demo-d3',
        dayNumber: 3,
        name: 'Lower + Conditioning',
        weekday: 'Wednesday',
        type: 'mixed',
        focus: ['legs', 'glutes'],
        estimatedMinutes: 50,
        blocks: [
          {
            id: 'demo-d3b1',
            kind: 'single',
            restAfterBlockSeconds: 150,
            exercises: [
              {
                id: 'demo-d3b1e1',
                name: 'Back Squat',
                modality: 'weights',
                equipment: 'Squat rack + barbell',
                machineSettings: ['rack pin height'],
                trackingFields: ['weight', 'reps'],
                sets: [
                  { type: 'warmup', reps: 8, targetWeight: 40, restSeconds: 60 },
                  { type: 'working', reps: 5, targetWeight: 80, rpeTarget: 8, restSeconds: 150 },
                  { type: 'working', reps: 5, targetWeight: 80, rpeTarget: 8, restSeconds: 150 },
                  { type: 'working', reps: 5, targetWeight: 80, rpeTarget: 9, restSeconds: 150 },
                ],
              },
            ],
          },
          {
            id: 'demo-d3b2',
            kind: 'single',
            restAfterBlockSeconds: 60,
            exercises: [
              {
                id: 'demo-d3b2e1',
                name: 'Stair Climber Intervals',
                modality: 'cardio',
                equipment: 'Stair climber',
                machineSettings: ['level'],
                trackingFields: ['level', 'duration'],
                sets: [
                  { type: 'timed', durationSeconds: 120, targetLevel: 8, restSeconds: 60 },
                  { type: 'timed', durationSeconds: 120, targetLevel: 10, restSeconds: 60 },
                  { type: 'timed', durationSeconds: 120, targetLevel: 12, rpeTarget: 9 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'demo-d4',
        dayNumber: 4,
        name: 'Upper Pull',
        weekday: 'Friday',
        type: 'strength',
        focus: ['back', 'biceps'],
        estimatedMinutes: 40,
        blocks: [
          {
            id: 'demo-d4b1',
            kind: 'single',
            restAfterBlockSeconds: 90,
            exercises: [
              {
                id: 'demo-d4b1e1',
                name: 'Lat Pulldown',
                modality: 'weights',
                equipment: 'Lat pulldown machine',
                machineSettings: ['knee pad height', 'grip width'],
                trackingFields: ['weight', 'reps'],
                sets: [
                  { type: 'working', repRange: [8, 12], targetWeight: 50, restSeconds: 90 },
                  { type: 'working', repRange: [8, 12], targetWeight: 50, restSeconds: 90 },
                  { type: 'working', repRange: [8, 12], targetWeight: 50, rpeTarget: 9, restSeconds: 90 },
                ],
              },
            ],
          },
          {
            id: 'demo-d4b2',
            kind: 'single',
            restAfterBlockSeconds: 60,
            exercises: [
              {
                id: 'demo-d4b2e1',
                name: 'Hanging Knee Raise',
                modality: 'bodyweight',
                equipment: 'Pull-up bar',
                trackingFields: ['reps'],
                sets: [
                  { type: 'working', repRange: [10, 15], restSeconds: 60 },
                  { type: 'working', repRange: [10, 15], restSeconds: 60 },
                  { type: 'amrap', rpeTarget: 10 },
                ],
              },
            ],
          },
          {
            id: 'demo-d4b3',
            kind: 'circuit',
            name: 'Finisher',
            timeCapSeconds: 300,
            notes: 'Alternate until the clock runs out. Switch whenever form slips.',
            exercises: [
              {
                id: 'demo-d4b3e1',
                name: 'Push-up',
                modality: 'bodyweight',
                trackingFields: ['reps'],
                sets: [{ type: 'amrap' }],
              },
              {
                id: 'demo-d4b3e2',
                name: 'Plank',
                modality: 'mobility',
                trackingFields: ['duration'],
                cues: 'Squeeze glutes, ribs down.',
                sets: [{ type: 'amrap' }],
              },
            ],
          },
        ],
      },
    ],
  }
}
