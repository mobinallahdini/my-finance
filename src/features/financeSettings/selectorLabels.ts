import { countryCodes, currencyCodes } from '../../domain/financeSettingsCodes.ts'

export function suggestedCountry(locales: readonly string[]): string {
  for (const locale of locales) {
    try { const region = new Intl.Locale(locale).region; if (region && countryCodes.includes(region)) return region } catch { /* No reliable suggestion. */ }
  }
  return ''
}
export function settingsChoices(type: 'region' | 'currency', locale = 'en') {
  let names: Intl.DisplayNames | undefined
  try { names = new Intl.DisplayNames([locale], { type }) } catch { /* Codes remain usable. */ }
  return (type === 'region' ? countryCodes : currencyCodes).map(code => ({ code, label: `${code} — ${names?.of(code) ?? code}` }))
    .sort((a, b) => a.label.slice(5).localeCompare(b.label.slice(5), locale))
}
