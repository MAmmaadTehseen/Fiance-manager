/**
 * Ledger export.
 *
 * The CSV builder is a pure function so both platforms share it; each wraps it
 * with its own way of handing the file to the user (a browser download on web,
 * a share sheet on mobile). Amounts are written signed by direction so a
 * spreadsheet sums a column to a real net figure.
 */
import { getSupabase } from './client'
import { toNumber } from './money'
import type { TransactionRow } from './hooks/useTransactions'

const COLUMNS = [
  'Date',
  'Type',
  'Amount',
  'Currency',
  'Account',
  'Counterparty',
  'Category',
  'Merchant',
  'Note',
  'Status',
] as const

/** Quote a cell only when it must be, doubling any embedded quotes (RFC 4180). */
function cell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Signed by direction: income positive, expense negative, transfer left bare. */
function signedAmount(t: TransactionRow): string {
  const n = toNumber(t.amount)
  if (t.type === 'income') return n.toFixed(2)
  if (t.type === 'expense') return (-n).toFixed(2)
  return n.toFixed(2)
}

export function transactionsToCsv(rows: TransactionRow[]): string {
  const lines = [COLUMNS.join(',')]
  for (const t of rows) {
    lines.push(
      [
        cell(t.occurred_at?.slice(0, 10) ?? ''),
        cell(t.type),
        cell(signedAmount(t)),
        cell(t.currency ?? 'PKR'),
        cell(t.account?.name ?? ''),
        cell(t.counterparty_account?.name ?? ''),
        cell(t.category?.name ?? ''),
        cell(t.merchant?.display_name ?? ''),
        cell(t.note ?? ''),
        cell(t.status),
      ].join(','),
    )
  }
  // CRLF: the line ending Excel expects, and harmless everywhere else.
  return lines.join('\r\n')
}

const EXPORT_SELECT = `
  *,
  account:accounts!transactions_account_id_fkey (id, name, type),
  counterparty_account:accounts!transactions_counterparty_account_id_fkey (id, name),
  category:categories (id, name, icon),
  merchant:merchants (id, display_name)
`

/**
 * Pulls the whole ledger for export. Bounded high rather than unbounded — a
 * personal ledger is thousands of rows at most, and an accidental full-table
 * scan should still terminate.
 */
export async function fetchLedgerForExport(): Promise<TransactionRow[]> {
  const { data, error } = await getSupabase()
    .from('transactions')
    .select(EXPORT_SELECT)
    .neq('status', 'void')
    .order('occurred_at', { ascending: false })
    .limit(10000)
    .returns<TransactionRow[]>()
  if (error) throw error
  return data ?? []
}

/** Convenience: fetch and format in one call. Returns the CSV text. */
export async function buildLedgerCsv(): Promise<string> {
  return transactionsToCsv(await fetchLedgerForExport())
}
