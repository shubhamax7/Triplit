import { getSupabase } from '../../lib/supabase';

export interface CreateExpenseInput {
  idempotencyKey: string;
  amountPaise: bigint;
  description: string;
  category?: string;
  occurredAt: string;
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
