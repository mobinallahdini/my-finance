/** Integer cents in one shared currency. Runtime values must be safe integers. */
export type MoneyCents = number

/** Calendar date in YYYY-MM-DD format, without a time or timezone. */
export type CalendarDate = string
export type TransactionDate = CalendarDate

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
  readonly taxAmountCents?: MoneyCents
  readonly receiptNumber?: string
}

export interface IncomeTransaction extends CategorizedTransaction {
  readonly type: 'income'
  readonly taxAmountCents?: never
  readonly receiptNumber?: never
}

/** Returned expense money, recorded on the refund date in an Expense category. */
export interface RefundTransaction extends CategorizedTransaction {
  readonly type: 'refund'
  readonly taxAmountCents?: never
  readonly receiptNumber?: never
}

export interface TransferTransaction extends TransactionBase {
  readonly type: 'transfer'
  readonly taxAmountCents?: never
  readonly receiptNumber?: never
  readonly fromAccountId: string
  readonly toAccountId: string
  readonly accountId?: never
  readonly categoryId?: never
}

export type Transaction =
  | ExpenseTransaction
  | IncomeTransaction
  | RefundTransaction
  | TransferTransaction

/** Monthly planning/tracking records; these never imply a financial Transaction. */
interface ObligationBase {
  readonly id: string
  readonly name: string
  readonly dueDay: number
  readonly startMonth: YearMonth
  readonly note?: string
  readonly isActive: boolean
}

/** V1 deliberately requires a fixed positive expected amount. */
export interface Bill extends ObligationBase {
  readonly type: 'bill'
  readonly expectedAmountCents: MoneyCents
  readonly originalAmountCents?: never
  readonly scheduledPaymentCents?: never
}

export interface Installment extends ObligationBase {
  readonly type: 'installment'
  readonly originalAmountCents: MoneyCents
  readonly scheduledPaymentCents: MoneyCents
  readonly expectedAmountCents?: never
}

export type Obligation = Bill | Installment

/** Several payments can cover one due month, including payments made later. */
export interface ObligationPayment {
  readonly id: string
  readonly obligationId: string
  readonly dueMonth: YearMonth
  readonly paidDate: CalendarDate
  readonly amountCents: MoneyCents
  readonly note?: string
}
