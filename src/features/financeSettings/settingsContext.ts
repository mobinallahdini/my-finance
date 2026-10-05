import { createContext, useContext } from 'react'
import type { ApplicationSettings } from '../../domain/financeSettings'

export interface SettingsAccess {
  settings: ApplicationSettings | null
  save: (value: ApplicationSettings, confirmedFromCurrency?: string) => Promise<void>
}
export const FinanceSettingsContext = createContext<SettingsAccess | null>(null)
export function useFinanceSettings() {
  const access = useContext(FinanceSettingsContext)
  if (!access) throw new Error('Finance settings provider is required.')
  return access
}
