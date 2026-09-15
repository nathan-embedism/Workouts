import { useState } from 'react'
import type { Navigate } from '../App'
import type { AppData } from '../types'
import { useStore, serialiseBackup, readRescued, DEFAULT_SETTINGS } from '../lib/store'
import { backupStatus, progressSummary } from '../lib/history'
import { buildFeedbackPrompt } from '../lib/schema'
import { copyText, downloadFile, useIsStandalone } from '../lib/hooks'
import { relativeDays } from '../lib/format'
import { Banner, Field, Toggle, useFlash } from '../components/ui'

export default function DataScreen({ navigate }: { navigate: Navigate }) {
  const {
    data, settings, sessions, updateSettings, markExported, mergeBackup, replaceAll, storageError,
    recovery, dismissRecovery, snapshotAvailable, undoRestore,
  } = useStore()
  const flash = useFlash()
  const standalone = useIsStandalone()
  const [restoreNote, setRestoreNote] = useState<string | null>(null)
  const backup = backupStatus(settings, sessions)

  const exportBackup = () => {
    const stamp = new Date().toISOString().slice(0, 10)
    downloadFile(`neon-sets-backup-${stamp}.json`, serialiseBackup(data))
    markExported()
    flash('Backup downloaded — keep it somewhere safe')
  }

  const copySummary = async () => {
    const text = buildFeedbackPrompt(progressSummary(sessions, settings.units))
    flash(await copyText(text) ? 'Copied — paste it to your AI tool' : 'Copy failed')
  }

  const restore = async (file: File, mode: 'merge' | 'replace') => {
    try {
      const parsed = JSON.parse(await file.text()) as AppData
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.sessions)) {
        setRestoreNote('That file is not a Neon Sets backup.')
        return
      }
      if (mode === 'replace') {
        if (!window.confirm('Replace everything on this device with the backup?')) return
        replaceAll(parsed)
        setRestoreNote('Restored from backup.')
      } else {
        const added = mergeBackup(parsed)
        setRestoreNote(`Merged in ${added.plans} plan${added.plans === 1 ? '' : 's'} and ${added.sessions} workout${added.sessions === 1 ? '' : 's'}.`)
      }
      flash('Backup loaded')
    } catch {
      setRestoreNote("Couldn't read that file — is it the JSON backup?")
    }
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <div className="eyebrow">Backups and preferences</div>
          <h1 className="topbar__title">Data</h1>
        </div>
      </header>

      {storageError && <Banner tone="error">{storageError}</Banner>}

      {recovery && (
        <Banner tone="warn">
          <strong>Heads up</strong>
          <p className="small" style={{ marginTop: 4 }}>{recovery.message}</p>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            {recovery.rescuedKey && (
              <button
                className="btn btn--sm btn--ghost"
                onClick={() => {
                  const rescued = readRescued(recovery.rescuedKey!)
                  if (!rescued) { flash('That copy is no longer on the device'); return }
                  downloadFile(`neon-sets-unreadable-${new Date().toISOString().slice(0, 10)}.json`, rescued, 'text/plain')
                  flash('Saved the unreadable copy')
                }}
              >
                Download it
              </button>
            )}
            <button className="btn btn--sm btn--quiet" onClick={dismissRecovery}>Dismiss</button>
          </div>
        </Banner>
      )}

      <div className={`card ${backup.due ? 'card--glow' : ''}`}>
        <div className="card__label">Your data lives on this device</div>
        <p className="small muted">
          Nothing is uploaded anywhere. Clearing your browser data, or losing the phone, loses
          your training log — so download a backup now and then.
        </p>
        <Banner tone={backup.due ? 'warn' : 'ok'}>
          {backup.message}
          {settings.lastExportAt && <> Last backup {relativeDays(settings.lastExportAt)}.</>}
        </Banner>
        <button className="btn btn--primary btn--block btn--xl" onClick={exportBackup}>
          Download backup
        </button>
        <button className="btn btn--ghost btn--block" onClick={copySummary}>
          Copy progress for my AI tool
        </button>
        <p className="hint">
          The summary is plain text: what you lifted, for how many reps, at what RPE — ready to
          paste back into your AI tool so your next plan is built on real numbers.
        </p>
      </div>

      <div className="card">
        <div className="card__label">Restore</div>
        {restoreNote && <Banner tone="info">{restoreNote}</Banner>}
        <div className="row" style={{ gap: 8 }}>
          <label className="btn btn--ghost grow" style={{ position: 'relative', overflow: 'hidden' }}>
            Merge a backup
            <input
              type="file" accept="application/json,.json"
              style={{ position: 'absolute', inset: 0, opacity: 0 }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void restore(file, 'merge')
                e.target.value = ''
              }}
            />
          </label>
          <label className="btn btn--ghost grow" style={{ position: 'relative', overflow: 'hidden' }}>
            Replace all
            <input
              type="file" accept="application/json,.json"
              style={{ position: 'absolute', inset: 0, opacity: 0 }}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void restore(file, 'replace')
                e.target.value = ''
              }}
            />
          </label>
        </div>
        <p className="hint">Merging keeps what's already here and adds anything missing.</p>
        {snapshotAvailable && (
          <button
            className="btn btn--ghost btn--block btn--sm"
            onClick={() => {
              if (!window.confirm('Put back the data as it was before the last restore or wipe?')) return
              flash(undoRestore() ? 'Previous data put back' : 'Nothing to put back')
            }}
          >
            Undo the last restore
          </button>
        )}
        <p className="hint">
          Replacing or deleting keeps a copy of what was there first, so a wrong tap is not the
          end of your training log.
        </p>
      </div>

      <div className="card">
        <div className="card__label">Workout preferences</div>
        <Field label="Units">
          <div className="chips">
            {(['kg', 'lb'] as const).map((unit) => (
              <button
                key={unit} type="button"
                className={`chip${settings.units === unit ? ' chip--on' : ''}`}
                onClick={() => updateSettings({ units: unit, weightIncrement: unit === 'kg' ? 2.5 : 5 })}
              >{unit}</button>
            ))}
          </div>
        </Field>
        <Field label="Weight button step" hint="How much each + or − adds while logging.">
          <div className="chips">
            {(settings.units === 'kg' ? [1, 1.25, 2.5, 5] : [1, 2.5, 5, 10]).map((stepValue) => (
              <button
                key={stepValue} type="button"
                className={`chip${settings.weightIncrement === stepValue ? ' chip--on' : ''}`}
                onClick={() => updateSettings({ weightIncrement: stepValue })}
              >{stepValue} {settings.units}</button>
            ))}
          </div>
        </Field>
        <Toggle
          label="Beep on timers" on={settings.sound}
          onChange={(sound) => updateSettings({ sound })}
          hint="Counts you in for the last three seconds of a rest."
        />
        <Toggle label="Vibrate" on={settings.vibrate} onChange={(vibrate) => updateSettings({ vibrate })} />
        <Toggle
          label="Keep the screen on" on={settings.keepAwake}
          onChange={(keepAwake) => updateSettings({ keepAwake })}
          hint="While a workout is running."
        />
      </div>

      <div className="card">
        <div className="card__label">Backup reminders</div>
        <Field label={`Nag me after ${settings.remindAfterSessions} workouts`}>
          <input
            type="range" min={1} max={12} value={settings.remindAfterSessions}
            onChange={(e) => updateSettings({ remindAfterSessions: Number(e.target.value) })}
          />
        </Field>
        <Field label={`…or after ${settings.remindAfterDays} days`}>
          <input
            type="range" min={1} max={60} value={settings.remindAfterDays}
            onChange={(e) => updateSettings({ remindAfterDays: Number(e.target.value) })}
          />
        </Field>
      </div>

      {!standalone && (
        <div className="card card--tight card--flat">
          <div className="card__label">Install it properly</div>
          <p className="small muted">
            <strong>iPhone:</strong> Share → “Add to Home Screen”.<br />
            <strong>Android:</strong> ⋮ menu → “Install app”.
          </p>
          <p className="hint">Installed, it runs offline and your data is far less likely to be cleared.</p>
        </div>
      )}

      <div className="card card--tight">
        <div className="card__label">Danger zone</div>
        <button
          className="btn btn--danger btn--block"
          onClick={() => {
            if (!window.confirm('Delete every plan and workout on this device? Download a backup first.')) return
            if (!window.confirm('Really delete everything? This cannot be undone.')) return
            replaceAll({ version: 1, settings: { ...DEFAULT_SETTINGS }, plans: [], sessions: [] })
            flash('All data cleared')
            navigate('/')
          }}
        >
          Delete everything
        </button>
      </div>
    </main>
  )
}
