import { useQuery } from '@tanstack/react-query';
import { calculateBalances, generateTransfers, type Balance, type Transfer } from '../../lib/accounting';
import { getSupabase } from '../../lib/supabase';

export interface MemberRecord { id: string; display_name: string; member_order: number; }
export interface LedgerEntryRecord { id: string; entry_type: 'EXPENSE' | 'REVERSAL' | 'ADJUSTMENT'; payer_member_id: string; payer_name_snapshot: string; amount_paise: string; description: string; occurred_at: string; correction_of: string | null; }
export interface GroupSummary { members: MemberRecord[]; entries: LedgerEntryRecord[]; balances: Balance[]; transfers: Transfer[]; totalPaise: bigint; }

function istMonthBounds(date: Date): { startIso: string; endIso: string } {
  // Get the IST month boundaries as UTC ISO strings for the Supabase query.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = (d: Date) => Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const now = parts(date);
  // First moment of the IST month, expressed as UTC.
  const startLocal = new Date(`${now.year}-${now.month}-01T00:00:00+05:30`);
  // First moment of the NEXT IST month.
  const y = Number(now.year);
  const m = Number(now.month);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const endLocal = new Date(`${nextMonth}-01T00:00:00+05:30`);
  return { startIso: startLocal.toISOString(), endIso: endLocal.toISOString() };
}

export async function fetchCurrentGroupSummary(): Promise<GroupSummary> {
  const client = getSupabase();
  const { startIso, endIso } = istMonthBounds(new Date());

  const [{ data: members, error: membersError }, { data: entries, error: entriesError }] = await Promise.all([
    client.from('members').select('id, display_name, member_order').eq('is_active', true).order('member_order'),
    client
      .from('ledger_entries')
      .select('id, entry_type, payer_member_id, payer_name_snapshot, amount_paise, description, occurred_at, correction_of')
      .gte('occurred_at', startIso)
      .lt('occurred_at', endIso)
      .order('occurred_at', { ascending: false }),
  ]);
  if (membersError) throw membersError;
  if (entriesError) throw entriesError;
  const activeMembers = (members ?? []) as MemberRecord[];
  if (activeMembers.length !== 3) throw new Error('This group must have exactly three active members.');
  const currentEntries = (entries ?? []) as LedgerEntryRecord[];
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
