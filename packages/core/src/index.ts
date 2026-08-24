/**
 * @batwa/core — everything the web app and the mobile app genuinely share.
 *
 * Types, money handling, the Supabase client and the whole data layer live
 * here. UI does not: React Native has no <div> and no CSS, so components are
 * written per platform while everything underneath them is written once.
 */

export * from './client'
export * from './money'
export * from './tokens'
export * from './version'
export * from './export'
export * from './types/db'
export type { Database, Json } from './types/database.types'

export * from './hooks/useAccounts'
export * from './hooks/useCategories'
export * from './hooks/useTransactions'
export * from './hooks/useInbox'
export * from './hooks/useIngest'
export * from './hooks/useBudgets'
export * from './hooks/useSavingsGoals'
export * from './hooks/useRecurring'
export * from './hooks/useInsights'
export * from './hooks/useEmailAccount'
