/**
 * Friendly aliases over the generated schema types.
 *
 * Import from here, not from `database.types.ts` — that file is regenerated
 * wholesale by `npm run db:types` and its shape is the generator's business.
 */

import type { Database, Tables, Enums } from './database.types'

export type { Database }

export type AccountType = Enums<'account_type'>
export type CategoryKind = Enums<'category_kind'>
export type TransactionType = Enums<'transaction_type'>
export type TransactionStatus = Enums<'transaction_status'>
export type TransactionSource = Enums<'transaction_source'>

export type SmsParseStatus = Enums<'sms_parse_status'>
export type TemplateKind = Enums<'template_kind'>

export type Profile = Tables<'profiles'>
export type Account = Tables<'accounts'>
export type Category = Tables<'categories'>
export type Merchant = Tables<'merchants'>
export type Transaction = Tables<'transactions'>
export type SmsMessage = Tables<'sms_messages'>
export type IngestToken = Tables<'ingest_tokens'>
export type ParserTemplate = Tables<'parser_templates'>
export type BalanceAssertion = Tables<'balance_assertions'>
export type Budget = Tables<'budgets'>
export type SavingsGoal = Tables<'savings_goals'>

/** Shape the ingest pipeline writes into `sms_messages.parsed`. */
export type ParsedFields = {
  amount: number | null
  merchant: string | null
  merchantKey: string | null
  last4: string | null
  balance: number | null
  occurredAt: string | null
  reference: string | null
}

export type AccountInsert = Database['public']['Tables']['accounts']['Insert']
export type AccountUpdate = Database['public']['Tables']['accounts']['Update']
export type TransactionInsert =
  Database['public']['Tables']['transactions']['Insert']
export type TransactionUpdate =
  Database['public']['Tables']['transactions']['Update']

/**
 * Postgres reports every view column as nullable because it cannot prove
 * otherwise. These columns all originate in NOT NULL base-table columns or
 * `coalesce`d aggregates, so the nulls are an artefact — assert them away
 * rather than null-check them at every call site.
 */
type NonNullableFields<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: NonNullable<T[P]>
}

export type AccountBalance = NonNullableFields<
  Tables<'account_balances'>,
  | 'account_id'
  | 'user_id'
  | 'name'
  | 'type'
  | 'currency'
  | 'opening_balance'
  | 'is_primary'
  | 'balance'
  | 'projected_balance'
>
