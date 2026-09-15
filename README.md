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

### Keeping the AI's output short

Long output is slow and it is where models drop details. The format has four
ways to say the same plan in less, all expanded on import so the runner only
ever sees fully written-out plans:

| Short form | Instead of |
|---|---|
| `"repeat": 3` on a set | three identical set objects |
| `"defaults": { "restSeconds": 90, … }` | repeating rest, modality and tracking on every set |
| `"exercises": { "bench": {…} }` + `{ "ref": "bench" }` | re-describing equipment, cues and settings on every day |
| omitting every `"id"` | hand-written ids the app generates anyway |

On a representative plan — 5 days, 5 exercises each, 100 sets — that is
**15,132 characters down to 7,104, a 53% reduction**, expanding to a byte-identical
plan. Both forms import; the prompt asks for the short one.

Two more things help when a model still struggles:

- **Import in batches.** Ask for a few days at a time; each reply is a complete
  JSON object, and the import screen offers to add its days to the plan you
  already have rather than starting a new one.
- **Fix requests.** When a plan fails to validate, one button copies the exact
  errors back as a correction prompt, so the model repairs rather than
  regenerates.

Rest is always a number of seconds. Rest days are `"type": "rest"` with
`"blocks": []`.

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

### Updates never touch what you've logged

Saved data lives under one key (`neon-sets:v1`) that app updates do not rewrite,
and four rules keep it that way:

- **Unknown fields are carried through.** `migrate()` spreads whatever it finds
  before normalising the fields it knows, so data written by a newer build (or
  by a build you later roll back from) is preserved rather than stripped.
- **Nothing is deleted on read.** Data that cannot be parsed is moved aside
  under its own key and reported in the Data tab with a download button — the
  app never silently replaces it with an empty store.
- **Destructive actions are snapshotted.** Restoring a backup or deleting
  everything keeps a copy first; "Undo the last restore" puts it back.
- **Writes only happen on change.** Loading the app never writes.

`npm run test:data` guards all of it against the real persistence layer, and
runs in CI on every push.

## Development

```bash
npm install
npm run dev        # http://localhost:5173/Workouts/
npm run build      # typecheck + production bundle into dist/
npm run preview    # serve the built bundle
npm run icons      # regenerate the app icons from scripts/make-icons.mjs
npm run test:data  # saved data survives an app update
npm run test:format # the short plan form expands to the same plan, and is smaller
```

Both checks run in CI on every push and before every deploy.

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
