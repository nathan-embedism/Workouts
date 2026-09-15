/**
 * The text handed to the user's AI tool: their answers, plus a strict description
 * of the JSON this app can ingest. Kept in one place so the prompt and the
 * validator never drift apart.
 */

export const SCHEMA_SPEC = `OUTPUT FORMAT (required)

Return ONE JSON object and nothing else — no prose before or after, no markdown
code fence. Numbers are numbers, not strings. No trailing commas, no comments.

{
  "schemaVersion": 1,
  "planName": "string — short name for the plan",
  "goal": "string, optional",
  "units": "kg" | "lb",
  "durationWeeks": 8,            // optional
  "daysPerWeek": 4,              // optional
  "notes": "string, optional — progression rules, warm-up policy, deloads",

  "defaults": {                  // optional, see SHORT FORM below
    "restSeconds": 90,
    "restAfterBlockSeconds": 120,
    "modality": "weights",
    "setType": "working",
    "trackingFields": ["weight", "reps"]
  },

  "exercises": {                 // optional library, see SHORT FORM below
    "bench": {
      "name": "Barbell Bench Press",
      "modality": "weights" | "cardio" | "bodyweight" | "mobility",
      "equipment": "string, optional — the machine or kit",
      "machineSettings": ["seat height"],   // optional, settings worth recording
      "cues": "string, optional — one line of technique cues",
      "trackingFields": ["weight", "reps"]  // optional, what the user logs
    }
  },

  "events": [                    // optional; key dates the plan is built around
    { "name": "Half marathon", "date": "2026-04-12", "notes": "optional" }
  ],

  "days": [
    {
      "dayNumber": 1,
      "name": "Upper Push",
      "weekday": "Monday",              // optional
      "type": "strength" | "cardio" | "mixed" | "mobility" | "rest",
      "focus": ["chest", "shoulders"],  // optional
      "estimatedMinutes": 55,           // optional
      "notes": "string, optional",
      "blocks": [
        {
          "kind": "single" | "superset" | "circuit",
          "name": "string, optional — e.g. 'Finisher'",
          "rounds": 3,                          // superset/circuit only
          "restBetweenExercisesSeconds": 15,    // superset/circuit only, optional
          "restAfterBlockSeconds": 120,         // optional
          "exercises": [
            {
              "ref": "bench",          // or write the exercise out in full here
              "sets": [
                {
                  "type": "warmup" | "working" | "amrap" | "timed" | "distance" | "failure",
                  "repeat": 3,                     // optional — do this set 3 times
                  "reps": 8,                       // optional
                  "repRange": [8, 12],             // optional, INSTEAD of reps
                  "targetWeight": 60,              // optional, in the plan's units
                  "targetWeightPercent": 75,       // optional, % of 1RM
                  "targetIncline": 6,              // optional
                  "targetLevel": 12,               // optional, machine resistance
                  "targetSpeed": 10.5,             // optional
                  "targetDistance": { "value": 400, "unit": "m" },  // m|km|mi|cal|floors
                  "durationSeconds": 600,          // optional, timed/cardio sets
                  "tempo": "3-1-1",                // optional
                  "rpeTarget": 8,                  // optional, 1-10
                  "restSeconds": 90,               // rest AFTER this set
                  "drops": [                       // optional drop sets, back to back
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

SHORT FORM — please use it

A written-out plan is long, slow to produce, and easy to make mistakes in.
These four things cut the output by well over half, and the app expands them
back out on import. Shorter output is more reliable output.

1. "repeat" instead of copies. Three identical working sets:
     { "type": "working", "repRange": [6, 8], "targetWeight": 60, "repeat": 3 }
   NOT three separate set objects. Only write sets out separately when they
   actually differ — a ramping warm-up, or a last set taken to failure.

2. "defaults" at the top of the plan. Anything listed there is inherited by
   every set, exercise and block that does not say otherwise, so you never
   repeat "restSeconds": 90 or "modality": "weights" again.

3. The "exercises" library. Describe each exercise ONCE with its equipment,
   cues and tracking fields, then use { "ref": "bench", "sets": [...] }
   wherever it appears. Worth it for anything used on more than one day.

4. Omit every "id". The app generates them. Omit any optional field you would
   otherwise be guessing at, and omit "notes" unless it says something useful.

RULES

1. Sets the user performs must all be accounted for, either as separate set
   objects or via "repeat". "3 x 10" on its own is not enough.
2. "single" blocks contain exactly one exercise. "superset" and "circuit"
   blocks contain two or more, performed in order each round; give them
   "rounds" and one set per round in each exercise's "sets".
3. Rest is always a number of seconds. Never "60-90s" or "1 min".
4. Rest days are days with "type": "rest" and "blocks": [].
5. "trackingFields" says what the app asks the user to record: "weight" and
   "reps" for lifting, "level"/"incline"/"speed"/"distance"/"duration" for
   machines and cardio. Bodyweight movements usually just track "reps".
6. If you are unsure of a starting weight, leave "targetWeight" out and put the
   guidance in "notes" — the app shows the user what they lifted last time.
7. If the plan is long, it is fine to send the days in batches: reply with a
   complete JSON object containing the first few days, and the app can add
   later days to the same plan. Never send a partial or truncated object.`

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

/** Sent back to the AI tool when its JSON could not be read. */
export function buildFixPrompt(errors: string[], warnings: string[]): string {
  const problems = errors.map((e) => `- ${e}`).join('\n')
  const notes = warnings.length
    ? `\n\nThe app also had to guess at these, so tighten them up if you can:\n${warnings.map((w) => `- ${w}`).join('\n')}`
    : ''
  return `The workout plan you sent could not be loaded. The app reported:

${problems}${notes}

Please send the corrected plan as ONE complete JSON object and nothing else — no
prose, no code fence. Keep everything that was already right; only fix what is
listed above. Use the short form where you can ("repeat" on a set, plan-level
"defaults", the "exercises" library with "ref"), and omit all ids.`
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
