/**
 * Regenerates the screenshots in docs/screenshots from a real build.
 *
 * Needs a preview server and Playwright, neither of which is a dependency of
 * this project:
 *   npm run build && npm run preview -- --port 4179
 *   npm i --no-save playwright sharp && node scripts/screenshots.mjs
 */
import { chromium, devices } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import sharp from 'sharp'

const BASE = process.env.PREVIEW_URL ?? 'http://localhost:4179/Workouts/'
const OUT = 'docs/screenshots'
const WIDTH = 460 // what the README displays them at

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch(
  // The bundled Chromium in this environment; omit when running locally.
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
)
const ctx = await browser.newContext({
  ...devices['iPhone 13'],
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
})
const page = await ctx.newPage()
page.on('dialog', (d) => d.accept())

const shot = async (name) => {
  // Let any toast clear so it never lands in a screenshot.
  await page.waitForTimeout(2800)
  const buffer = await page.screenshot()
  await sharp(buffer).resize({ width: WIDTH }).png({ compressionLevel: 9 }).toFile(`${OUT}/${name}.png`)
  console.log('wrote', `${OUT}/${name}.png`)
}

await page.goto(BASE, { waitUntil: 'networkidle' })

/* ---------------------------------------------------------------- the plan */
await page.getByRole('button', { name: /I already have the JSON/i }).click()
await page.locator('textarea').first().fill(readFileSync('scripts/sample-plan.json', 'utf8'))
await page.waitForTimeout(400)
await shot('import')
await page.getByRole('button', { name: /Use this plan/i }).click()
await page.waitForTimeout(400)

/* ------------------------------------------------ a few weeks of training */
await page.evaluate(() => {
  const key = 'neon-sets:v1'
  const data = JSON.parse(localStorage.getItem(key))
  const plan = data.plans[0]
  const day = plan.plan.days[0]
  const exercises = day.blocks.flatMap((b) => b.exercises)
  const sessions = []
  for (let week = 5; week >= 1; week--) {
    const started = new Date(Date.now() - week * 7 * 86400000)
    const logs = []
    exercises.forEach((exercise, ei) => {
      exercise.sets.forEach((set, si) => {
        if (set.type === 'warmup') return
        const base = set.targetWeight ?? 20 + ei * 6
        logs.push({
          sessionId: `seed_${week}`, stepId: `${exercise.id}:${si}`, exerciseId: exercise.id,
          exerciseName: exercise.name, blockId: day.blocks[0].id, setIndex: si, round: 0,
          setType: set.type, units: 'kg',
          weight: Math.round((base + (5 - week) * 2.5) * 2) / 2,
          reps: (set.repRange?.[0] ?? set.reps ?? 8) + (week % 2),
          rpe: 7 + ((week + si) % 3),
          at: started.toISOString(),
        })
      })
    })
    sessions.push({
      id: `seed_${week}`, planId: plan.id, planName: plan.plan.planName, dayId: day.id,
      dayName: day.name, startedAt: started.toISOString(),
      endedAt: new Date(started.getTime() + 47 * 60000).toISOString(),
      units: 'kg', stepIndex: 99, logs,
    })
  }
  data.sessions = sessions
  data.settings.lastExportAt = new Date(Date.now() - 9 * 86400000).toISOString()
  data.settings.lastExportSessionCount = 3
  localStorage.setItem(key, JSON.stringify(data))
})
await page.reload({ waitUntil: 'networkidle' })
await shot('home')

/* ------------------------------------------------------------- the runner */
await page.locator('.plan-day').first().click()
await page.waitForTimeout(300)
await shot('day')
await page.getByRole('button', { name: /Start workout/i }).click()
await page.waitForTimeout(400)
await page.getByRole('button', { name: '8', exact: true }).click()
await shot('set')
await page.getByRole('button', { name: /^Log set/i }).click()
await page.waitForTimeout(600)
await shot('timer')

// Walk the rest of the session so the summary has something in it.
for (let i = 0; i < 8; i++) {
  const next = page.getByRole('button', { name: /Next set/i })
  if (await next.count()) { await next.click(); await page.waitForTimeout(150) }
  const log = page.getByRole('button', { name: /^Log set/i })
  if (!(await log.count())) break
  const rpe = page.getByRole('button', { name: String(7 + (i % 3)), exact: true })
  if (await rpe.count()) await rpe.first().click()
  await log.click()
  await page.waitForTimeout(150)
}
await page.getByRole('button', { name: /Exit workout/i }).click()
await page.getByRole('button', { name: /Finish and save/i }).click()
await page.waitForTimeout(400)
await shot('summary')
await page.getByRole('button', { name: /Save workout/i }).click()
await page.waitForTimeout(400)

/* ------------------------------------------------- progress, plan, prompt */
await page.locator('.tab', { hasText: 'Log' }).click()
await page.getByRole('button', { name: 'Progress', exact: true }).click()
await page.waitForTimeout(400)
await page.evaluate(() => window.scrollTo(0, 430))
await shot('progress')

await page.locator('.tab', { hasText: 'Today' }).click()
await page.getByRole('button', { name: /Schedule/i }).click()
await page.waitForTimeout(300)
await shot('schedule')

await page.locator('.tab', { hasText: 'Prompt' }).click()
await page.waitForTimeout(200)
await page.locator('textarea').first().fill('Put on some muscle and keep my knees happy')
for (const chip of ['Chest', 'Back', 'Legs']) await page.getByRole('button', { name: chip, exact: true }).click()
for (const chip of ['Full commercial gym', 'Dumbbells']) await page.getByRole('button', { name: chip, exact: true }).click()
await page.evaluate(() => window.scrollTo(0, 240))
await shot('prompt')

await page.locator('.tab', { hasText: 'Data' }).click()
await page.waitForTimeout(300)
await shot('data')

await browser.close()
console.log('done')
