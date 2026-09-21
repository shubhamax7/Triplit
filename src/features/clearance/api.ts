import { getSupabase } from '../../lib/supabase';

export interface ClearanceRequestRecord {
  id: string;
  group_id: string;
  requested_by_member_id: string;
  status: 'PENDING' | 'APPROVED' | 'CANCELLED' | 'EXECUTED' | 'EXPIRED';
  expires_at: string;
  created_at: string;
  approvals: Array<{ approver_member_id: string; created_at: string }>;
}

export async function fetchActiveClearance(): Promise<{
  request: ClearanceRequestRecord | null;
  epoch: number;
}> {
  const client = getSupabase();
  const [{ data: group }, { data: requests, error }] = await Promise.all([
    client.from('ledger_groups').select('epoch').single(),
    client
      .from('clearance_requests')
      .select('id, group_id, requested_by_member_id, status, expires_at, created_at')
      .in('status', ['PENDING', 'APPROVED'])
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  if (error) throw error;
  const currentReq = requests?.[0] ?? null;
  let approvals: Array<{ approver_member_id: string; created_at: string }> = [];

  if (currentReq) {
    const { data: apprs } = await client
      .from('clearance_approvals')
      .select('approver_member_id, created_at')
      .eq('request_id', currentReq.id);
    approvals = apprs ?? [];
  }

  return {
    request: currentReq ? { ...currentReq, approvals } : null,
    epoch: group?.epoch ?? 1,
  };
}

export async function requestClearance(idempotencyKey: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('request_clearance', {
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw error;
  return data as string;
}

export async function approveClearance(requestId: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('approve_clearance', {
    p_request_id: requestId,
  });
  if (error) throw error;
  return data as string;
}

export async function cancelClearance(requestId: string): Promise<void> {
  const { error } = await getSupabase().rpc('cancel_clearance', {
    p_request_id: requestId,
  });
  if (error) throw error;
}

export async function executeClearance(requestId: string): Promise<number> {
  const { data, error } = await getSupabase().rpc('execute_clearance', {
    p_request_id: requestId,
  });
  if (error) throw error;
  return data as number;
}
