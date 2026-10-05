import type { CalendarDate, YearMonth } from './models.ts'

export function requireCalendarMonth(month: YearMonth): void {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith('0000')) {
    throw new RangeError('Month must use YYYY-MM format with a year from 0001 to 9999.')
  }
}

/** Gregorian calendar arithmetic without Date, timestamps, or timezone conversion. */
export function daysInCalendarMonth(month: YearMonth): number {
  requireCalendarMonth(month)
  const year = Number(month.slice(0, 4))
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Number(month.slice(5, 7)) - 1]
}

export function requireCalendarDate(date: CalendarDate): void {
  if (typeof date !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date)) {
    throw new RangeError('Date must be a valid calendar date in YYYY-MM-DD format.')
  }
  const day = Number(date.slice(8, 10))
  if (day < 1 || day > daysInCalendarMonth(date.slice(0, 7))) {
    throw new RangeError('Date must be a valid calendar date in YYYY-MM-DD format.')
  }
}

/** Undefined at December 9999: never invent an unsupported year. */
export function nextCalendarMonth(month: YearMonth): YearMonth | undefined {
  requireCalendarMonth(month)
  if (month === '9999-12') return undefined
  const year = Number(month.slice(0, 4)), number = Number(month.slice(5, 7))
  return number === 12 ? `${String(year + 1).padStart(4, '0')}-01` : `${month.slice(0, 4)}-${String(number + 1).padStart(2, '0')}`
}

/** One-based ordinal; differences count calendar days, including leap days. */
export function calendarDayNumber(date: CalendarDate): number {
  requireCalendarDate(date)
  const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7))
  const previous = year - 1
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const beforeMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][month - 1]
  return previous * 365 + Math.floor(previous / 4) - Math.floor(previous / 100) + Math.floor(previous / 400)
    + beforeMonth + (leap && month > 2 ? 1 : 0) + Number(date.slice(8, 10))
}
