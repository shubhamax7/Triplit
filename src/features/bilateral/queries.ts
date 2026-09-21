import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../../lib/supabase';
import { calculateBilateralLedger, type BilateralEntry } from '../../lib/accounting';
import { fetchBilateralTransactions, type BilateralTransactionRecord } from './api';

export interface BilateralPairSummary {
  counterpartyId: string;
  counterpartyName: string;
  netPaise: bigint; // Positive = counterparty owes user; Negative = user owes counterparty
  transactions: BilateralTransactionRecord[];
}

export function useBilateralPairs(currentMemberId: string | undefined) {
  return useQuery({
    queryKey: ['bilateral-pairs', currentMemberId],
    queryFn: async (): Promise<BilateralPairSummary[]> => {
      if (!currentMemberId) return [];
      const client = getSupabase();

      // Fetch the other members (exactly 2 counterparties)
      const { data: members, error: membersError } = await client
        .from('members')
        .select('id, display_name')
        .neq('id', currentMemberId)
        .eq('is_active', true);
      if (membersError) throw membersError;

      const pairs: BilateralPairSummary[] = [];

      for (const counterparty of members ?? []) {
        const txs = await fetchBilateralTransactions(counterparty.id);
        const entries: BilateralEntry[] = txs.map((tx) => ({
          payerMemberId: tx.payer_member_id,
          counterpartyMemberId: tx.counterparty_member_id,
          amountPaise: BigInt(tx.amount_paise),
          entryType: tx.entry_type,
        }));
        const netPaise = calculateBilateralLedger(currentMemberId, counterparty.id, entries);
        pairs.push({
          counterpartyId: counterparty.id,
          counterpartyName: counterparty.display_name,
          netPaise,
          transactions: txs,
        });
      }

      return pairs;
    },
    enabled: Boolean(currentMemberId),
    staleTime: 30_000,
  });
}

export function useBilateralPairDetail(
  currentMemberId: string | undefined,
  counterpartyId: string
) {
  return useQuery({
    queryKey: ['bilateral-pair-detail', currentMemberId, counterpartyId],
    queryFn: async () => {
      if (!currentMemberId) throw new Error('Missing current member ID');
      const txs = await fetchBilateralTransactions(counterpartyId);
      const entries: BilateralEntry[] = txs.map((tx) => ({
        payerMemberId: tx.payer_member_id,
        counterpartyMemberId: tx.counterparty_member_id,
        amountPaise: BigInt(tx.amount_paise),
        entryType: tx.entry_type,
      }));
      const netPaise = calculateBilateralLedger(currentMemberId, counterpartyId, entries);
      return { transactions: txs, netPaise };
    },
    enabled: Boolean(currentMemberId && counterpartyId),
  });
}
