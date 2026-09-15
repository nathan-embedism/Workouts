/**
 * The text handed to the user's AI tool: their answers, plus a strict description
 * of the JSON this app can ingest. Kept in one place so the prompt and the
 * validator never drift apart.
 */

export const SCHEMA_SPEC = `OUTPUT FORMAT (required)

Return ONE JSON object and nothing else — no prose before or after, no markdown
code fence. It must match this shape exactly. Fields marked "optional" may be
omitted, but never invent extra top-level keys.

{
  "schemaVersion": 1,
  "planName": "string — short name for the plan",
  "goal": "string, optional — one line on what the plan is for",
  "units": "kg" | "lb",
  "durationWeeks": 8,            // optional, whole number
  "daysPerWeek": 4,              // optional, whole number
  "notes": "string, optional — progression rules, how to warm up, when to deload",
  "events": [                    // optional; key dates the plan is built around
    { "name": "Half marathon", "date": "2026-04-12", "notes": "optional" }
  ],
  "days": [
    {
      "id": "d1",                       // unique within the plan
      "dayNumber": 1,                   // 1..n, the order they are performed
      "name": "Upper Push",
      "weekday": "Monday",              // optional
      "type": "strength" | "cardio" | "mixed" | "mobility" | "rest",
      "focus": ["chest", "shoulders"],  // optional
      "estimatedMinutes": 55,           // optional
      "notes": "string, optional",
      "blocks": [
        {
          "id": "d1b1",
          "kind": "single" | "superset" | "circuit",
          "name": "string, optional — e.g. 'Finisher'",
          "rounds": 3,                          // superset/circuit only
          "restBetweenExercisesSeconds": 15,    // superset/circuit only, optional
          "restAfterBlockSeconds": 120,         // optional
          "notes": "string, optional",
          "exercises": [
            {
              "id": "d1b1e1",
              "name": "Barbell Bench Press",
              "modality": "weights" | "cardio" | "bodyweight" | "mobility",
              "equipment": "string, optional — the machine or kit, e.g. 'Flat bench + barbell'",
              "machineSettings": ["seat height", "pad position"],  // optional, settings worth recording
              "cues": "string, optional — one line of technique cues",
              "trackingFields": ["weight", "reps"],  // optional; what the user logs
              "sets": [
                {
                  "type": "warmup" | "working" | "amrap" | "timed" | "distance" | "failure",
                  "reps": 8,                       // optional
                  "repRange": [8, 12],             // optional, use INSTEAD of reps for a range
                  "targetWeight": 60,              // optional, in the plan's units
                  "targetWeightPercent": 75,       // optional, % of 1RM
                  "targetIncline": 6,              // optional, treadmill/stepper incline
                  "targetLevel": 12,               // optional, machine resistance level
                  "targetSpeed": 10.5,             // optional, km/h or mph per units
                  "targetDistance": { "value": 400, "unit": "m" },  // unit: m|km|mi|cal|floors
                  "durationSeconds": 600,          // optional, for timed/cardio sets
                  "tempo": "3-1-1",                // optional
                  "rpeTarget": 8,                  // optional, 1-10
                  "restSeconds": 90,               // rest AFTER this set
                  "drops": [                       // optional drop sets, performed back to back
                    { "weightPercent": 80, "reps": 8 },
                    { "weightPercent": 60, "toFailure": true }
                  ],
                  "notes": "string, optional"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

RULES
1. Every set the user performs must be listed explicitly. Do not write
   "3 x 10" as one set — emit three set objects (they may differ in load).
2. "single" blocks contain exactly one exercise. "superset" and "circuit"
   blocks contain two or more, performed in order each round; give them
   "rounds" and put one set per round in each exercise's "sets" array.
3. Rest is always seconds, as a number, on "restSeconds" (after a set) or
   "restAfterBlockSeconds". Never write "60-90s" or "1 min".
4. Rest days are days with "type": "rest" and an empty "blocks": [].
5. Use "trackingFields" to say what the app should ask for: "weight" and
   "reps" for lifting, "level"/"incline"/"speed"/"distance"/"duration" for
   machines and cardio. Bodyweight movements usually just track "reps".
6. All ids are unique, non-empty strings.
7. Numbers are numbers, not strings. No trailing commas. No comments.
8. If you are unsure of a starting weight, omit "targetWeight" and put the
   guidance in "notes" — the app shows the user what they lifted last time.`

export interface BuilderForm {
  goal: string
  experience: string
  daysPerWeek: string
  sessionMinutes: string
  targetAreas: string[]
  equipment: string[]
  equipmentNotes: string
  cardioPreference: string
  limitations: string
  preferences: string
  units: 'kg' | 'lb'
  durationWeeks: string
  events: { name: string; date: string }[]
  allowSupersets: boolean
  allowDropSets: boolean
  includeWarmups: boolean
  extraNotes: string
}

export const EMPTY_FORM: BuilderForm = {
  goal: '',
  experience: 'Intermediate',
  daysPerWeek: '4',
  sessionMinutes: '60',
  targetAreas: [],
  equipment: [],
  equipmentNotes: '',
  cardioPreference: 'Some cardio',
  limitations: '',
  preferences: '',
  units: 'kg',
  durationWeeks: '8',
  events: [],
  allowSupersets: true,
  allowDropSets: false,
  includeWarmups: true,
  extraNotes: '',
}

export const TARGET_AREAS = [
  'Full body', 'Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Glutes',
  'Core', 'Cardio / endurance', 'Mobility',
]

export const EQUIPMENT_OPTIONS = [
  'Full commercial gym', 'Barbell + plates', 'Dumbbells', 'Kettlebells',
  'Resistance machines', 'Cable machine', 'Squat rack', 'Bench',
  'Pull-up bar', 'Resistance bands', 'Treadmill', 'Exercise bike',
  'Rowing machine', 'Stair climber', 'Bodyweight only',
]

export const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced']

export const CARDIO_PREFERENCES = [
  'No cardio', 'Some cardio', 'Cardio focused', 'Endurance / event training',
]

function line(label: string, value: string): string {
  return value.trim() ? `- ${label}: ${value.trim()}\n` : ''
}

export function buildPrompt(form: BuilderForm): string {
  let brief = ''
  brief += line('Main goal', form.goal)
  brief += line('Training experience', form.experience)
  brief += line('Days per week', form.daysPerWeek)
  brief += line('Time available per session (minutes)', form.sessionMinutes)
  brief += line('Areas to target', form.targetAreas.join(', '))
  brief += line(
    'Equipment available',
    [form.equipment.join(', '), form.equipmentNotes].filter(Boolean).join('; '),
  )
  brief += line('Cardio preference', form.cardioPreference)
  brief += line('Injuries / limitations', form.limitations)
  brief += line('Likes, dislikes and preferences', form.preferences)
  brief += line('Units', form.units)
  brief += line('Plan length (weeks)', form.durationWeeks)
  if (form.events.length) {
    const events = form.events
      .filter((e) => e.name.trim() || e.date.trim())
      .map((e) => `${e.name.trim() || 'Event'} on ${e.date || 'date TBC'}`)
      .join('; ')
    brief += line('Key dates to train towards', events)
  }
  brief += line('Supersets', form.allowSupersets ? 'Use them where they help' : 'Avoid supersets')
  brief += line('Drop sets', form.allowDropSets ? 'Use them where they help' : 'Avoid drop sets')
  brief += line('Warm-up sets', form.includeWarmups ? 'Include warm-up sets in the plan' : 'Skip warm-up sets')
  brief += line('Anything else', form.extraNotes)

  return `You are writing a training plan that will be loaded into a workout app.
The app walks the user through the plan set by set, so the plan must be complete
and unambiguous.

ABOUT THE PERSON TRAINING
${brief || '- (no details given — ask nothing, use sensible general-population defaults)\n'}
Design a plan that fits the equipment, time and days above. Work up to any key
dates listed. Include rest days so the week is complete.

${SCHEMA_SPEC}`
}

/** A short progress digest the user can paste back into their AI tool. */
export function buildFeedbackPrompt(summary: string): string {
  return `Here is how my training has actually gone since you wrote my plan.

${summary}

Please review it and give me an updated plan. Keep what is working, adjust loads
and volume where the logged RPE and weights suggest I should, and return the
result in the same JSON format you used before (schemaVersion 1, one JSON object,
no prose or code fence).`
}
