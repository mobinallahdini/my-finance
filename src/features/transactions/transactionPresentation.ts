import type { YearMonth } from '../../domain/models'
import { formatCad } from '../accounts/money'
import { localCalendarDate, type EntryTransaction } from './transactionHelpers'

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const dateFormatter = new Intl.DateTimeFormat('en-CA', { dateStyle: 'long' })

export function readableMonth(month: YearMonth): string {
  return `${monthNames[Number(month.slice(5)) - 1]} ${Number(month.slice(0, 4))}`
}

export function adjacentMonth(month: YearMonth, direction: -1 | 1): YearMonth | undefined {
  const [year, calendarMonth] = month.split('-').map(Number)
  const index = year * 12 + calendarMonth - 1 + direction
  if (index < 12 || index > 9999 * 12 + 11) return undefined
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`
}

/** Local calendar fields avoid UTC shifts, including years below 100. */
export function readableTransactionDate(date: string, today = new Date()): string {
  if (date === localCalendarDate(today)) return 'Today'
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date === localCalendarDate(yesterday)) return 'Yesterday'
  const [year, month, day] = date.split('-').map(Number)
  const calendarDate = new Date(0)
  calendarDate.setFullYear(year, month - 1, day)
  calendarDate.setHours(12, 0, 0, 0)
  return dateFormatter.format(calendarDate)
}

/** Display signs never alter the persisted positive-cent amounts. */
export function signedTransactionAmount(transaction: Pick<EntryTransaction, 'type' | 'amount'>): string {
  const sign = transaction.type === 'expense' ? '-' : transaction.type === 'income' ? '+' : ''
  return `${sign}${formatCad(transaction.amount)}`
}
