import { countryCodes, currencyCodes } from './financeSettingsCodes.ts'

export const applicationSettingsId = 'application' as const
export interface ApplicationSettings {
  id: typeof applicationSettingsId
  countryCode: string
  currencyCode: string
  profileType: 'personal' | 'business'
  fiscalYearStartMonth: number
  onboardingCompleted: boolean
}
export const legacyApplicationSettings: ApplicationSettings = {
  id: applicationSettingsId, countryCode: 'CA', currencyCode: 'CAD',
  profileType: 'personal', fiscalYearStartMonth: 1, onboardingCompleted: true,
}
export function validateCurrencyCode(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !currencyCodes.includes(value)) throw new Error('Choose a supported two-decimal currency.')
}
export function validateApplicationSettings(value: unknown): ApplicationSettings {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Finance settings must be an object.')
  const record = value as Record<string, unknown>
  const keys = ['id', 'countryCode', 'currencyCode', 'profileType', 'fiscalYearStartMonth', 'onboardingCompleted']
  if (Object.keys(record).some(key => !keys.includes(key))) throw new Error('Finance settings contain an unsupported field.')
  if (record.id !== applicationSettingsId) throw new Error('Invalid application settings ID.')
  if (typeof record.countryCode !== 'string' || !countryCodes.includes(record.countryCode)) throw new Error('Choose a valid Country / Region.')
  validateCurrencyCode(record.currencyCode)
  if (record.profileType !== 'personal' && record.profileType !== 'business') throw new Error('Choose Personal or Business.')
  if (!Number.isInteger(record.fiscalYearStartMonth) || Number(record.fiscalYearStartMonth) < 1 || Number(record.fiscalYearStartMonth) > 12) throw new Error('Fiscal year start month must be 1–12.')
  if (typeof record.onboardingCompleted !== 'boolean') throw new Error('Onboarding completion must be a boolean.')
  return { id: applicationSettingsId, countryCode: record.countryCode, currencyCode: record.currencyCode,
    profileType: record.profileType, fiscalYearStartMonth: Number(record.fiscalYearStartMonth), onboardingCompleted: record.onboardingCompleted }
}
