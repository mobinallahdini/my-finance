import { useEffect, useState, type ReactNode } from 'react'
import type { ApplicationSettings } from '../../domain/financeSettings'
import { bootstrapApplicationSettings, observeApplicationSettings, saveApplicationSettings } from '../../persistence/applicationSettings'
import { FinanceSettingsContext } from './settingsContext'
import { FinanceSettingsForm } from './FinanceSettingsForm'
import './financeSettings.css'

export function FinanceSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ApplicationSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    let subscription: { unsubscribe: () => void } | undefined
    void bootstrapApplicationSettings().then(value => {
      if (!active) return
      setSettings(value); setLoading(false)
      subscription = observeApplicationSettings(next => { if (active) setSettings(next) }, () => {
        if (active) setError('Finance settings could not be read. Your stored records have not been changed.')
      })
    }).catch(() => {
      if (active) { setError('Local settings could not be loaded. Check browser storage and try again. Your stored records have not been changed.'); setLoading(false) }
    })
    return () => { active = false; subscription?.unsubscribe() }
  }, [attempt])
  if (loading || error) return <main className="finance-bootstrap">
    <h1>My Finance</h1>
    {loading ? <p role="status">Loading My Finance…</p> : <><p role="alert">{error}</p><button onClick={() => { setError(''); setLoading(true); setAttempt(value => value + 1) }}>Retry</button></>}
  </main>
  const save = async (value: ApplicationSettings, confirmedFromCurrency?: string) => {
    const persisted = await saveApplicationSettings(value, confirmedFromCurrency)
    setSettings(persisted)
  }
  return <FinanceSettingsContext value={{ settings, save }}>
    {settings?.onboardingCompleted ? children : <FinanceSettingsForm onboarding />}
  </FinanceSettingsContext>
}
