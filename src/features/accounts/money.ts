import type { MoneyCents } from '../../domain/models'

const maximumCents = BigInt(Number.MAX_SAFE_INTEGER)
const cadFormatter = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
})

/** Parse decimal text exactly before converting a bounded integer to Number. */
export function parseDollars(input: string, allowNegative = false): MoneyCents {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim())
  if (!match) {
    throw new Error('Enter a dollar amount with at most 2 decimal places, such as 12.34. Do not use commas or currency symbols.')
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

export function formatCad(cents: MoneyCents): string {
  if (!Number.isSafeInteger(cents)) throw new RangeError('Money must be safe integer cents.')
  const magnitude = BigInt(cents < 0 ? -cents : cents)
  const wholeDollars = magnitude / 100n
  const signedDollars = cents < 0 ? (wholeDollars === 0n ? -0 : -wholeDollars) : wholeDollars
  // Keep the fractional cents exact even at the safe-integer boundary.
  return cadFormatter.formatToParts(signedDollars).map((part) => (
    part.type === 'fraction' ? String(magnitude % 100n).padStart(2, '0') : part.value
  )).join('')
}
