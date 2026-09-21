import { getSupabase } from '../../lib/supabase';

export interface AccountingPeriodRecord {
  id: string;
  epoch: number;
  year: number;
  month: number;
  status: 'OPEN' | 'CLOSED' | 'ARCHIVED';
  created_at: string;
  closed_at: string | null;
}

export interface SettlementSnapshotRecord {
  id: string;
  period_id: string;
  algorithm_version: string;
  rounding_policy_version: string;
  total_paise: string;
  per_member: Array<{
    member_id: string;
    contribution_paise: number | string;
    share_paise: number | string;
    balance_paise: number | string;
  }>;
  transfers: Array<{
    from_member_id: string;
    to_member_id: string;
    amount_paise: number | string;
  }>;
  ledger_hash: string;
  created_at: string;
  superseded_by: string | null;
}

export async function fetchAccountingPeriods(): Promise<AccountingPeriodRecord[]> {
  const { data, error } = await getSupabase()
    .from('accounting_periods')
    .select('id, epoch, year, month, status, created_at, closed_at')
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchSettlementSnapshot(periodId: string): Promise<SettlementSnapshotRecord | null> {
  const { data, error } = await getSupabase()
    .from('settlement_snapshots')
    .select('*')
    .eq('period_id', periodId)
    .is('superseded_by', null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function closePeriod(periodId: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('close_period', { p_period_id: periodId });
  if (error) throw error;
  return data as string;
}

export async function reopenPeriod(periodId: string): Promise<void> {
  const { error } = await getSupabase().rpc('reopen_period', { p_period_id: periodId });
  if (error) throw error;
}
