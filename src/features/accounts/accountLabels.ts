import type { Account } from '../../domain/models'

export const accountTypeLabels: Record<Account['type'], string> = {
  bank: 'Bank',
  cash: 'Cash',
  credit_card: 'Credit Card',
}

export function accountWriteError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === 'Cannot change the type of an account referenced by transactions.') {
      return 'This account has transactions, so its type cannot be changed. You can still edit its name, opening balance, and credit limit.'
    }
    if (error.message === 'Cannot delete an account referenced by transactions.') {
      return 'This account has transactions and cannot be deleted. Its transaction history must be resolved before deleting it.'
    }
    if (error.message.startsWith('Account does not exist:')) {
      return 'This account no longer exists. Cancel editing and refresh the account list.'
    }
  }
  return 'The account could not be saved or deleted. Your changes were not applied. Check that browser storage is available and try again.'
}
