import { getSupabase } from '../../lib/supabase';

export interface CreateBilateralTransactionInput {
  idempotencyKey: string;
  counterpartyMemberId: string;
  amountPaise: bigint;
  description: string;
  category?: string;
  occurredAt: string;
}

export interface CreateBilateralCorrectionInput {
  originalId: string;
  reversalKey: string;
  adjustmentKey: string;
  newAmountPaise: bigint;
  newDescription: string;
  newCategory?: string;
}

export interface BilateralTransactionRecord {
  id: string;
  entry_type: 'BILATERAL_EXPENSE' | 'BILATERAL_REVERSAL' | 'BILATERAL_ADJUSTMENT';
  payer_member_id: string;
  counterparty_member_id: string;
  payer_name_snapshot: string;
  counterparty_name_snapshot: string;
  amount_paise: string;
  description: string;
  category: string | null;
  occurred_at: string;
  correction_of: string | null;
}

export async function createBilateralTransaction(
  input: CreateBilateralTransactionInput
): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_bilateral_transaction', {
    p_idempotency_key: input.idempotencyKey,
    p_counterparty_member_id: input.counterpartyMemberId,
    p_amount_paise: input.amountPaise.toString(),
    p_description: input.description,
    p_category: input.category ?? null,
    p_occurred_at: input.occurredAt,
  });
  if (error) throw error;
  return data as string;
}

export async function createBilateralCorrection(
  input: CreateBilateralCorrectionInput
): Promise<{ original_id: string; reversal_id: string; adjustment_id: string }> {
  const { data, error } = await getSupabase().rpc('create_bilateral_correction', {
    p_original_id: input.originalId,
    p_reversal_key: input.reversalKey,
    p_adjustment_key: input.adjustmentKey,
    p_new_amount_paise: input.newAmountPaise.toString(),
    p_new_description: input.newDescription,
    p_new_category: input.newCategory ?? null,
  });
  if (error) throw error;
  return data;
}

export async function fetchBilateralTransactions(
  counterpartyMemberId: string
): Promise<BilateralTransactionRecord[]> {
  const { data, error } = await getSupabase()
    .from('bilateral_transactions')
    .select(
      'id, entry_type, payer_member_id, counterparty_member_id, payer_name_snapshot, counterparty_name_snapshot, amount_paise, description, category, occurred_at, correction_of'
    )
    .or(`counterparty_member_id.eq.${counterpartyMemberId},payer_member_id.eq.${counterpartyMemberId}`)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
