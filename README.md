# Neon Sets

A workout runner you install to your phone's home screen. It doesn't write your
training plan — your AI tool does. The app builds the prompt, ingests the JSON
that comes back, and then walks you through the session set by set with
full-screen timers, oversized controls and local logging.

Dark, neon, portrait-only by design: readable at arm's length, with gym hands.

## How it works

1. **Build the prompt** — answer what you're training for, how many days, how
   long, what equipment you have, injuries, key dates. Tap **Copy prompt**.
2. **Paste it into any AI tool** — ChatGPT, Claude, Gemini, whatever you use.
   The prompt includes a strict JSON spec the tool must output.
3. **Import the reply** — paste it back. The app validates it and tells you
   exactly what's wrong if the format is off.
4. **Train** — tap through each set. Big targets, a full-screen rest timer, a
   "last time" line showing what you lifted and at what machine settings,
   and an RPE tap after every set.
5. **Back it up** — everything is stored on the device. The app nags you to
   download a JSON backup, and gives you a plain-text progress summary to paste
   back into your AI tool so the next plan is built on real numbers.

## Features

- Straight sets, supersets and circuits (rounds are interleaved properly)
- Drop sets, with each drop's load calculated from the weight you actually used
- Timed and distance work: cardio machines, intervals, holds
- Full-screen countdown that keeps running correctly when the screen locks, and
  counts into overtime rather than silently ending your rest
- Weight, incline, level, speed, distance and duration logging: hold the +/−
  buttons to run the value up, or tap the number and type it straight in;
  per-set RPE and notes
- "Last time" recall per exercise, including a range when the load moved
- Progress charts per exercise — heaviest set, volume, reps, time and average
  RPE across sessions, with a shared crosshair and a table of the raw numbers
- Schedule view: your week laid out by weekday, rest days, and a countdown to
  each key date with progress through the plan
- Works offline, installs to the home screen, screen stays awake while training

## The plan format

The contract between your AI tool and the app is a single JSON object. It is
described in full in [`src/lib/schema.ts`](src/lib/schema.ts) (the `SCHEMA_SPEC`
constant is what gets copied into your prompt), and the types live in
[`src/types.ts`](src/types.ts).

```jsonc
{
  "schemaVersion": 1,
  "planName": "8-week hypertrophy",
  "units": "kg",
  "daysPerWeek": 4,
  "events": [{ "name": "Half marathon", "date": "2026-04-12" }],
  "days": [
    {
      "id": "d1",
      "dayNumber": 1,
      "name": "Upper Push",
      "type": "strength",
      "blocks": [
        {
          "id": "d1b1",
          "kind": "single",              // or "superset" / "circuit"
          "restAfterBlockSeconds": 120,
          "exercises": [
            {
              "id": "d1b1e1",
              "name": "Barbell Bench Press",
              "modality": "weights",
              "equipment": "Flat bench + barbell",
              "trackingFields": ["weight", "reps"],
              "sets": [
                { "type": "warmup", "reps": 10, "targetWeight": 20, "restSeconds": 60 },
                { "type": "working", "repRange": [6, 8], "targetWeight": 60, "rpeTarget": 8, "restSeconds": 120 }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

Every set is listed explicitly — `3 x 10` becomes three set objects — so the
runner always knows exactly what to put on screen next. Rest is always a number
of seconds. Rest days are `"type": "rest"` with `"blocks": []`.

The importer is deliberately forgiving: it strips markdown fences and
surrounding chatter, fills in sensible defaults, and reports what it changed.
Anything it genuinely cannot work out is reported as an error with the path to
the offending field.

## Your data

Everything lives in `localStorage` on the device, and nothing is ever uploaded.
That means:

- Clearing your browser data clears your training log.
- Installing to the home screen makes eviction much less likely (the app also
  asks for persistent storage).
- **Download backups.** The Data tab exports a JSON file with every plan and
  every logged set, and reminds you when you're overdue.

## Development

```bash
npm install
npm run dev        # http://localhost:5173/Workouts/
npm run build      # typecheck + production bundle into dist/
npm run preview    # serve the built bundle
npm run icons      # regenerate the app icons from scripts/make-icons.mjs
```

Stack: Vite + React + TypeScript, `vite-plugin-pwa` for the service worker and
manifest. No UI framework, no state library, no runtime dependencies beyond
React. Fonts (Barlow Condensed, Big Shoulders Display — SIL OFL) are vendored in
`public/fonts` so the app works fully offline.

### Deploying

Pushing to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`. Enable it once under **Settings → Pages →
Source → GitHub Actions**; the site then lives at
`https://<user>.github.io/<repo>/`.

The base path is taken from the repo name at build time. For a custom domain or
root-level hosting, build with `BASE_PATH=/`.

## Layout

```
src/
  lib/
    schema.ts     prompt text + the JSON spec sent to the AI tool
    validate.ts   tolerant parser and validator for what comes back
    steps.ts      flattens a day into the sequence the runner walks through
    store.tsx     localStorage-backed app state
    history.ts    "last time" recall, backup nagging, AI progress summaries
  screens/        Home, PromptBuilder, ImportPlan, DayPreview, Runner, …
  components/     timer, set logger, shared controls
```
