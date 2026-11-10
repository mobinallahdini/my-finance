import type { MoneyCents } from './models.ts'

export function requireSafeCents(value: MoneyCents): MoneyCents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError('Money must be expressed as safe integer cents.')
  }
  return value
}

export function requirePositiveAmount(amount: MoneyCents): MoneyCents {
  requireSafeCents(amount)
  if (amount <= 0) throw new RangeError('Transaction amounts must be positive.')
  return amount
}
