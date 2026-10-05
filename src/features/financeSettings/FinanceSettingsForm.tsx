import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react'
import { applicationSettingsId, type ApplicationSettings } from '../../domain/financeSettings'
import { CurrencyChangeConfirmationRequired } from '../../persistence/applicationSettings'
import { useFinanceSettings } from './settingsContext'
import { settingsChoices, suggestedCountry } from './selectorLabels'

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const countries = settingsChoices('region')
const currencies = settingsChoices('currency')
export function FinanceSettingsForm({ onboarding = false }: { onboarding?: boolean }) {
  const { settings, save } = useFinanceSettings()
  const [countryCode, setCountry] = useState(settings?.countryCode ?? suggestedCountry(navigator.languages))
  const [currencyCode, setCurrency] = useState(settings?.currencyCode ?? '')
  const [profileType, setProfile] = useState<ApplicationSettings['profileType']>(settings?.profileType ?? 'personal')
  const [fiscalMonth, setFiscal] = useState(settings?.fiscalYearStartMonth ?? 1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const saving = useRef(false)
  const prefix = useId()
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current) return
    saving.current = true; setBusy(true); setError(''); setStatus('')
    const next: ApplicationSettings = { id: applicationSettingsId, countryCode, currencyCode, profileType, fiscalYearStartMonth: fiscalMonth, onboardingCompleted: true }
    try {
      try { await save(next) }
      catch (caught) {
        if (!(caught instanceof CurrencyChangeConfirmationRequired)) throw caught
        if (!window.confirm(`${caught.message}\n\nChange ${caught.currencyCode} to ${currencyCode}? No exchange-rate conversion occurs.`)) return
        await save(next, caught.currencyCode)
      }
      setStatus('Finance settings saved.')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Finance settings could not be saved. Try again.') }
    finally { saving.current = false; setBusy(false) }
  }
  const Heading = onboarding ? 'h1' : 'h2'
  const Container = onboarding ? 'main' : 'section'
  return <Container className={`finance-settings${onboarding ? ' finance-onboarding' : ''}`} aria-labelledby={`${prefix}-heading`}>
    {!onboarding && <a className="more-back-link" href="#more">← Back to More</a>}
    {onboarding && <p className="finance-brand">My Finance</p>}
    <Heading id={`${prefix}-heading`} ref={heading} tabIndex={-1}>{onboarding ? 'Welcome to My Finance' : 'Finance settings'}</Heading>
    <p className="finance-introduction">{onboarding ? 'Set up your workspace. Your records stay on this device.' : 'Preferences for your current workspace.'}</p>
    <form onSubmit={event => { void submit(event) }} aria-busy={busy}>
      <fieldset disabled={busy} className="finance-fields">
        <legend className="finance-sr-only">Workspace preferences</legend>
        <div className="finance-field"><label htmlFor={`${prefix}-country`}>Country / Region</label>
          <select id={`${prefix}-country`} required value={countryCode} onChange={event => setCountry(event.target.value)} aria-describedby={`${prefix}-country-help`}>
            <option value="">Choose Country / Region</option>{countries.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select><p id={`${prefix}-country-help`}>A browser-locale suggestion may be shown. Choose your region; currency is independent.</p></div>
        <div className="finance-field"><label htmlFor={`${prefix}-currency`}>Currency</label>
          <select id={`${prefix}-currency`} required value={currencyCode} onChange={event => setCurrency(event.target.value)} aria-describedby={`${prefix}-currency-help`}>
            <option value="">Choose currency</option>{currencies.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select><p id={`${prefix}-currency-help`}>One currency for this workspace. Only currencies with two decimal minor units are supported. No currency conversion.</p></div>
        <fieldset className="finance-profile"><legend>Use My Finance for</legend>
          {(['personal', 'business'] as const).map(type => <label key={type}><input type="radio" name={`${prefix}-profile`} value={type} checked={profileType === type} onChange={() => setProfile(type)} />{type === 'personal' ? 'Personal' : 'Business'}</label>)}
        </fieldset>
        <div className="finance-field"><label htmlFor={`${prefix}-fiscal`}>Fiscal year starts in</label>
          <select id={`${prefix}-fiscal`} value={fiscalMonth} onChange={event => setFiscal(Number(event.target.value))} aria-describedby={`${prefix}-fiscal-help`}>
            {months.map((month, index) => <option value={index + 1} key={month}>{month}</option>)}
          </select><p id={`${prefix}-fiscal-help`}>Saved for future annual and fiscal reporting. Monthly reports stay the same.</p></div>
      </fieldset>
      {error && <p className="finance-error" ref={errorRef} role="alert" tabIndex={-1}>{error}</p>}
      <p role="status">{status}</p>
      <button className="button-primary finance-save" disabled={busy} type="submit">{busy ? 'Saving…' : onboarding ? 'Start using My Finance' : 'Save settings'}</button>
      {!onboarding && <p className="finance-help">Personal / Business describes this workspace. Separate profiles and tax fields are not available yet.</p>}
    </form>
  </Container>
}
