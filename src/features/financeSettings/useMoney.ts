import { formatMoney } from '../accounts/money'
import { useFinanceSettings } from './settingsContext'

export function useMoney() {
  const { settings } = useFinanceSettings()
  if (!settings?.onboardingCompleted) throw new Error('Workspace setup is required before formatting money.')
  const currencyCode = settings.currencyCode
  return { currencyCode, formatAmount: (minorUnits: number) => formatMoney(minorUnits, currencyCode) }
}
