import { getSupabase } from '../../lib/supabase';

export interface CreateExpenseInput {
  idempotencyKey: string;
  amountPaise: bigint;
  description: string;
  category?: string;
  occurredAt: string;
}

export interface CreateCorrectionInput {
  originalId: string;
  reversalKey: string;
  adjustmentKey: string;
  newAmountPaise: bigint;
  newDescription: string;
  newCategory?: string;
}

export async function createExpense(input: CreateExpenseInput): Promise<string> {
  const { data, error } = await getSupabase().rpc('create_expense', {
    p_idempotency_key: input.idempotencyKey,
    p_amount_paise: input.amountPaise.toString(),
    p_description: input.description,
    p_category: input.category ?? null,
    p_occurred_at: input.occurredAt,
  });
  if (error) throw error;
  return data as string;
}

export async function createCorrection(input: CreateCorrectionInput): Promise<{ original_id: string; reversal_id: string; adjustment_id: string }> {
  const { data, error } = await getSupabase().rpc('create_correction', {
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
