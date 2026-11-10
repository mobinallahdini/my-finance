# Finance domain

This module contains data types and pure calculations only. It has no React,
storage, network, or third-party dependencies. Inputs are not mutated; category
totals are returned in a new map.

The [v1.3 reporting engine](../../docs/financial-reporting-engine.md) prepares
immutable rows, shared financial summaries, filters, and deterministic groups
from existing records. `financialSummary.ts` supplies the reducer also used by
the monthly APIs; `transactionQuery.ts` supplies Reports and Transactions with
one filter predicate. No report data is persisted.

The independent monthly planning/tracking domain is documented in
[Bills & Installments](obligations/README.md). Its payments never create
Transactions or contribute to the financial calculations below.

## Money and balances

All monetary fields and results use integer cents in a single shared currency:
8000 means $80.00 and 50000 means $500.00. Never store decimal dollar amounts.
The number alias documents the unit; TypeScript cannot enforce integer values.
Calculations reject non-safe integers, non-positive transaction amounts, negative
credit limits, and arithmetic results outside JavaScript's safe integer range.
Only transactions relevant to a calculation are checked.

Bank/cash balances represent money available: expenses and outgoing transfers
decrease them; income, refunds, and incoming transfers increase them. Negative balances
represent a deficit.

Credit-card balances represent debt owed: expenses and outgoing transfers
increase debt; refunds and incoming transfers decrease debt. A negative balance
represents an overpayment/account credit. Persistence prohibits new Income on
cards; pure balance calculation retains its legacy interpretation as a debt
credit. Opening balances use the same sign conventions.

Available credit is the optional credit limit minus calculated debt. A missing
limit returns undefined, a zero limit is valid, and results are not clamped:
negative available credit indicates being over limit, while overpayment can yield
available credit above the limit.

A 50000-cent bank-to-card transfer lowers bank balance and card debt by 50000
each and adds zero spending. An 8000-cent expense lowers bank balance or increases
card debt by 8000, and adds 8000 spending in either case.

## Input invariants

- IDs must be non-empty, stable, and unique within each collection. Each transaction
  must occur once in the supplied list; calculations do not deduplicate it.
- Account/category references must exist, and an expense/income category's type
  must match its transaction. Future entry/import validation must enforce this;
  these calculations do not receive the complete account/category collections.
- Transfers must have distinct source and destination accounts, share the same
  currency, and have no category. The union forbids category/account fields on
  transfers and transfer fields on expenses/income. Same-account transfers are
  rejected when calculating that account's balance.
- Dates must be valid calendar dates formatted YYYY-MM-DD, years 0001–9999.
  Date aliases are strings, not runtime date validators; future input validation
  must enforce valid dates. Monthly queries validate YYYY-MM and match the stored
  calendar month directly, avoiding timezone conversions.
- Opening balances are the starting snapshot before all supplied transactions.
  Account calculations include all supplied matching transactions, with no
  date cutoff. Supply only the desired posted ledger when requesting a balance.
- Spending is expenses minus refunds in the recorded month. Income and transfers
  never contribute. Empty months return zero and an empty map; categories with
  expenses or refunds are included. Negative net totals are preserved. Refund
  uses an Expense category and has no tax/receipt metadata. See the
  [refund policy](../../docs/transaction-improvements.md).
- `calculateMonthlyTotalIncome` sums only income in the requested YYYY-MM,
  validates the month and positive safe integer amounts, and rejects unsafe
  accumulated totals. Expenses and transfers never contribute; empty months
  return zero. It shares the existing monetary and month guards without changing
  account balance or expense calculation semantics.

No real accounts or categories are seeded. No testing framework is installed.
The exported functions can later be tested directly with typed fixtures for
bank/cash/card expenses, income, transfers, month boundaries, overpayments,
missing/zero limits, and unsafe monetary values.
