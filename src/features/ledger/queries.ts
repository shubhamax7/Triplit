import { useQuery } from '@tanstack/react-query';
import { calculateBalances, generateTransfers, type Balance, type Transfer } from '../../lib/accounting';
import { getSupabase } from '../../lib/supabase';

export interface MemberRecord { id: string; display_name: string; member_order: number; }
export interface LedgerEntryRecord { id: string; entry_type: 'EXPENSE' | 'REVERSAL' | 'ADJUSTMENT'; payer_member_id: string; payer_name_snapshot: string; amount_paise: string; description: string; occurred_at: string; correction_of: string | null; }
export interface GroupSummary { members: MemberRecord[]; entries: LedgerEntryRecord[]; balances: Balance[]; transfers: Transfer[]; totalPaise: bigint; }

function istMonthKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(date);
  return `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}`;
}

export async function fetchCurrentGroupSummary(): Promise<GroupSummary> {
  const client = getSupabase();
  const [{ data: members, error: membersError }, { data: entries, error: entriesError }] = await Promise.all([
    client.from('members').select('id, display_name, member_order').eq('is_active', true).order('member_order'),
    client.from('ledger_entries').select('id, entry_type, payer_member_id, payer_name_snapshot, amount_paise, description, occurred_at, correction_of').order('occurred_at', { ascending: false }).limit(100),
  ]);
  if (membersError) throw membersError;
  if (entriesError) throw entriesError;
  const activeMembers = (members ?? []) as MemberRecord[];
  if (activeMembers.length !== 3) throw new Error('This group must have exactly three active members.');
  const currentMonth = istMonthKey(new Date());
  const currentEntries = ((entries ?? []) as LedgerEntryRecord[]).filter((entry) => istMonthKey(new Date(entry.occurred_at)) === currentMonth);
  const contributions = currentEntries.map((entry) => ({
    memberId: entry.payer_member_id,
    amountPaise: (entry.entry_type === 'REVERSAL' ? -1n : 1n) * BigInt(entry.amount_paise),
  }));
  const balances = calculateBalances(activeMembers.map((member) => member.id), contributions);
  return { members: activeMembers, entries: currentEntries, balances, transfers: generateTransfers(balances), totalPaise: contributions.reduce((sum, item) => sum + item.amountPaise, 0n) };
}

export function useCurrentGroupSummary() {
  return useQuery({ queryKey: ['group-summary', 'current-ist-month'], queryFn: fetchCurrentGroupSummary });
}
