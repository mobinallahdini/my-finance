/** Integer cents in one shared currency. Runtime values must be safe integers. */
export type MoneyCents = number

/** Calendar date in YYYY-MM-DD format, without a time or timezone. */
export type TransactionDate = string

/** Calendar month in YYYY-MM format. */
export type YearMonth = string

interface AccountBase {
  readonly id: string
  readonly name: string
  readonly openingBalance: MoneyCents
}

export interface AssetAccount extends AccountBase {
  readonly type: 'bank' | 'cash'
  readonly creditLimit?: never
}

export interface CreditCardAccount extends AccountBase {
  readonly type: 'credit_card'
  readonly creditLimit?: MoneyCents
}

export type Account = AssetAccount | CreditCardAccount

export interface Category {
  readonly id: string
  readonly name: string
  readonly type: 'expense' | 'income'
}

interface TransactionBase {
  readonly id: string
  readonly amount: MoneyCents
  readonly date: TransactionDate
  readonly note?: string
}

interface CategorizedTransaction extends TransactionBase {
  readonly accountId: string
  readonly categoryId: string
  readonly fromAccountId?: never
  readonly toAccountId?: never
}

export interface ExpenseTransaction extends CategorizedTransaction {
  readonly type: 'expense'
}

export interface IncomeTransaction extends CategorizedTransaction {
  readonly type: 'income'
}

export interface TransferTransaction extends TransactionBase {
  readonly type: 'transfer'
  readonly fromAccountId: string
  readonly toAccountId: string
  readonly accountId?: never
  readonly categoryId?: never
}

export type Transaction =
  | ExpenseTransaction
  | IncomeTransaction
  | TransferTransaction
