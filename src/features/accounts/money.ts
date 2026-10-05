import type { MoneyCents } from '../../domain/models'
import { validateCurrencyCode } from '../../domain/financeSettings.ts'

const maximumCents = BigInt(Number.MAX_SAFE_INTEGER)
const formatters = new Map<string, Intl.NumberFormat>()

/** Parse decimal text exactly before converting a bounded integer to Number. */
export function parseDollars(input: string, allowNegative = false): MoneyCents {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim())
  if (!match) {
    throw new Error('Enter an amount with at most 2 decimal places, such as 12.34. Do not use commas or currency symbols.')
  }
  if (match[1] && !allowNegative) {
    throw new Error('Enter zero or a positive amount.')
  }

  const digits = `${match[2]}${(match[3] ?? '').padEnd(2, '0')}`.replace(/^0+/, '') || '0'
  if (digits.length > 16) throw new Error('This amount is too large to store safely.')
  const magnitude = BigInt(digits)
  if (magnitude > maximumCents) throw new Error('This amount is too large to store safely.')
  return Number(match[1] ? -magnitude : magnitude)
}

export function dollarsForInput(cents: MoneyCents): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError('Money must be safe integer cents.')
  const magnitude = BigInt(cents < 0 ? -cents : cents)
  return `${cents < 0 ? '-' : ''}${magnitude / 100n}.${String(magnitude % 100n).padStart(2, '0')}`
}

export function formatMoney(cents: MoneyCents, currencyCode: string, locale = 'en-CA'): string {
  validateCurrencyCode(currencyCode)
  const key = `${locale}:${currencyCode}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    formatters.set(key, formatter)
  }
  if (!Number.isSafeInteger(cents)) throw new RangeError('Money must be safe integer cents.')
  const magnitude = BigInt(cents < 0 ? -cents : cents)
  const wholeDollars = magnitude / 100n
  const signedDollars = cents < 0 ? (wholeDollars === 0n ? -0 : -wholeDollars) : wholeDollars
  // Keep the fractional cents exact even at the safe-integer boundary.
  return formatter.formatToParts(signedDollars).map((part) => (
    part.type === 'fraction' ? String(magnitude % 100n).padStart(2, '0') : part.value
  )).join('')
}
