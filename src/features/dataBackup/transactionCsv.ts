import type { Account, Category, Transaction } from '../../domain/models'
import type { FinancialSnapshot } from '../../persistence/snapshotValidation'
import { transactionRecord } from '../../persistence/snapshotValidation.ts'
import { requireId, validateTransactionReferences } from '../../persistence/validation.ts'
import { dollarsForInput, parseDollars } from '../accounts/money.ts'
import { compareTransactions } from '../transactions/transactionHelpers.ts'
import { csvTextEncoding, parseCsv, protectCsvText, unprotectCsvText, writeCsv } from './csv.ts'

export const transactionCsvColumns = ['id', 'type', 'date', 'amount_cad', 'category_id', 'category_name', 'account_id', 'account_name',
  'from_account_id', 'from_account_name', 'to_account_id', 'to_account_name', 'note', 'text_encoding'] as const
export const accountCsvColumns = ['id', 'name', 'type', 'opening_balance_cad', 'credit_limit_cad', 'text_encoding'] as const
export const categoryCsvColumns = ['id', 'name', 'type', 'text_encoding'] as const
type CsvFields = Record<(typeof transactionCsvColumns)[number], string>
export interface CsvSourceRow { rowNumber: number; fields: CsvFields; parseError?: string }
export type MappingField = 'accountId' | 'categoryId' | 'fromAccountId' | 'toAccountId'
export type RowMapping = Partial<Record<MappingField, string>>
export type CsvMappings = Record<number, RowMapping>
export type CsvRowStatus = 'Ready' | 'Duplicate' | 'Needs mapping' | 'Invalid' | 'Conflict'
export const csvRowStatuses: readonly CsvRowStatus[] = ['Ready', 'Duplicate', 'Needs mapping', 'Invalid', 'Conflict']
export interface CsvPreviewRow extends CsvSourceRow {
  status: CsvRowStatus
  message: string
  transaction?: Transaction
  mapping: RowMapping
}

export function transactionsCsv(snapshot: FinancialSnapshot): string {
  const accounts = new Map(snapshot.accounts.map((account) => [account.id, account.name]))
  const categories = new Map(snapshot.categories.map((category) => [category.id, category.name]))
  return writeCsv(transactionCsvColumns, [...snapshot.transactions].sort(compareTransactions).map((transaction) => {
    const fields = transaction.type === 'transfer'
      ? ['', '', '', '', transaction.fromAccountId, accounts.get(transaction.fromAccountId) ?? '', transaction.toAccountId, accounts.get(transaction.toAccountId) ?? '']
      : [transaction.categoryId, categories.get(transaction.categoryId) ?? '', transaction.accountId, accounts.get(transaction.accountId) ?? '', '', '', '', '']
    return [protectCsvText(transaction.id), protectCsvText(transaction.type), protectCsvText(transaction.date), dollarsForInput(transaction.amount),
      ...fields.map(protectCsvText), protectCsvText(transaction.note ?? ''), csvTextEncoding]
  }))
}
export function accountsCsv(accounts: readonly Account[]): string {
  return writeCsv(accountCsvColumns, accounts.map((account) => [protectCsvText(account.id), protectCsvText(account.name), protectCsvText(account.type),
    dollarsForInput(account.openingBalance), account.type === 'credit_card' && account.creditLimit !== undefined ? dollarsForInput(account.creditLimit) : '', csvTextEncoding]))
}
export function categoriesCsv(categories: readonly Category[]): string {
  return writeCsv(categoryCsvColumns, categories.map((category) => [protectCsvText(category.id), protectCsvText(category.name), protectCsvText(category.type), csvTextEncoding]))
}
export function parseTransactionCsv(text: string): CsvSourceRow[] {
  const [headers, ...records] = parseCsv(text)
  if (!headers || headers.length !== transactionCsvColumns.length || new Set(headers).size !== headers.length
    || !transactionCsvColumns.every((column) => headers.includes(column))) {
    throw new Error('Choose a My Finance Transactions CSV with the documented version 1 columns, including text_encoding. Accounts, Categories, and arbitrary bank CSV files cannot be imported here.')
  }
  return records.flatMap((values, index) => {
    if (values.every((value) => value === '')) return []
    const fields = Object.fromEntries(transactionCsvColumns.map((column) => [column, values[headers.indexOf(column)] ?? ''])) as CsvFields
    let parseError: string | undefined
    try {
      if (values.length !== headers.length) throw new Error(`Expected ${headers.length} columns; found ${values.length}.`)
      if (fields.text_encoding !== csvTextEncoding) throw new Error('Unsupported text_encoding. Use a My Finance version 1 Transactions CSV.')
      for (const column of transactionCsvColumns) {
        if (column !== 'amount_cad' && column !== 'text_encoding') fields[column] = unprotectCsvText(fields[column])
      }
    } catch (error) { parseError = error instanceof Error ? error.message : 'Invalid CSV row.' }
    return [{ rowNumber: index + 2, fields, ...(parseError ? { parseError } : {}) }]
  })
}

function normalized(name: string) { return name.trim().toLowerCase() }
function nameIndex<T extends { id: string; name: string }>(records: readonly T[]) {
  const index = new Map<string, T[]>()
  for (const record of records) {
    const key = normalized(record.name), matches = index.get(key) ?? []
    matches.push(record); index.set(key, matches)
  }
  return index
}
function resolve<T extends { id: string; name: string }>(id: string, name: string, byId: ReadonlyMap<string, T>, byName: ReadonlyMap<string, readonly T[]>, override?: string): string | undefined {
  if (override !== undefined) return byId.has(override) ? override : undefined
  if (byId.has(id)) return id
  if (!normalized(name)) return undefined
  const matches = byName.get(normalized(name)) ?? []
  return matches.length === 1 ? matches[0].id : undefined
}
/** Display names and empty/absent notes do not make an otherwise identical transaction different. */
export function transactionIdentity(transaction: Transaction): string {
  return JSON.stringify([transaction.id, transaction.type, transaction.date, transaction.amount, transaction.note ?? '',
    ...(transaction.type === 'transfer' ? [transaction.fromAccountId, transaction.toAccountId] : [transaction.accountId, transaction.categoryId])])
}

export function previewTransactionCsv(source: readonly CsvSourceRow[], snapshot: FinancialSnapshot, mappings: CsvMappings = {}): CsvPreviewRow[] {
  const accounts = new Map(snapshot.accounts.map((account) => [account.id, account]))
  const categories = new Map(snapshot.categories.map((category) => [category.id, category]))
  const existing = new Map(snapshot.transactions.map((transaction) => [transaction.id, transaction]))
  const accountNames = nameIndex(snapshot.accounts)
  const categoryNames = { expense: nameIndex(snapshot.categories.filter((category) => category.type === 'expense')),
    income: nameIndex(snapshot.categories.filter((category) => category.type === 'income')) }
  const rows: CsvPreviewRow[] = source.map((row) => {
    const mapping: RowMapping = {}
    const fields = row.fields
    try {
      if (row.parseError) throw new Error(row.parseError)
      requireId(fields.id)
      const amount = parseDollars(fields.amount_cad)
      const base = { id: fields.id, type: fields.type, date: fields.date, amount, ...(fields.note ? { note: fields.note } : {}) }
      if (fields.type !== 'expense' && fields.type !== 'income' && fields.type !== 'transfer') throw new Error('Invalid transaction type.')
      if (fields.type === 'transfer') {
        if (fields.account_id || fields.account_name || fields.category_id || fields.category_name) throw new Error('Transfers cannot have account or category fields.')
        transactionRecord({ ...base, fromAccountId: 'preview-from', toAccountId: 'preview-to' })
        mapping.fromAccountId = resolve(fields.from_account_id, fields.from_account_name, accounts, accountNames, mappings[row.rowNumber]?.fromAccountId)
        mapping.toAccountId = resolve(fields.to_account_id, fields.to_account_name, accounts, accountNames, mappings[row.rowNumber]?.toAccountId)
      } else {
        if (fields.from_account_id || fields.from_account_name || fields.to_account_id || fields.to_account_name) throw new Error('Expense and Income cannot have transfer fields.')
        transactionRecord({ ...base, accountId: 'preview-account', categoryId: 'preview-category' })
        mapping.accountId = resolve(fields.account_id, fields.account_name, accounts, accountNames, mappings[row.rowNumber]?.accountId)
        mapping.categoryId = resolve(fields.category_id, fields.category_name, categories, categoryNames[fields.type], mappings[row.rowNumber]?.categoryId)
      }
      if (Object.values(mapping).some((id) => id === undefined)) return { ...row, mapping, status: 'Needs mapping', message: 'Choose existing accounts and categories. Missing or ambiguous names are never guessed.' }
      const transaction = transactionRecord({ ...base, ...mapping })
      validateTransactionReferences(transaction, accounts, categories)
      const old = existing.get(transaction.id)
      const status = old ? transactionIdentity(old) === transactionIdentity(transaction) ? 'Duplicate' : 'Conflict' : 'Ready'
      return { ...row, mapping, transaction, status, message: status === 'Duplicate' ? 'Identical transaction ID already exists; skipped.'
        : status === 'Conflict' ? 'This ID already exists with different data. It will not be overwritten.' : 'Ready to add.' }
    } catch (error) {
      return { ...row, mapping, status: 'Invalid', message: error instanceof Error ? error.message : 'Invalid transaction.' }
    }
  })
  const byId = new Map<string, CsvPreviewRow[]>()
  for (const row of rows) {
    if (!row.fields.id) continue
    const group = byId.get(row.fields.id) ?? []
    group.push(row); byId.set(row.fields.id, group)
  }
  for (const group of byId.values()) {
    if (group.length < 2) continue
    const identities = new Set(group.filter((row) => row.transaction).map((row) => transactionIdentity(row.transaction!)))
    if (identities.size > 1 || group.some((row) => !row.transaction)) {
      for (const row of group.filter((row) => row.transaction)) {
        row.status = 'Conflict'; row.message = 'This ID is repeated with different or unresolved data in the CSV. No row with this conflict will be imported.'
      }
    } else {
      for (const row of group.slice(1).filter((row) => row.status === 'Ready')) {
        row.status = 'Duplicate'; row.message = 'Identical transaction repeated in this CSV; skipped.'
      }
    }
  }
  return rows
}
