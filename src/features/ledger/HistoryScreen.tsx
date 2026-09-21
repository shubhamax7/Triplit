import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../../lib/supabase';
import { formatInr } from '../../lib/currency';
import { CorrectionModal } from './CorrectionModal';
import { useAuth } from '../auth/AuthProvider';

interface LedgerItem {
  id: string;
  entry_type: 'EXPENSE' | 'REVERSAL' | 'ADJUSTMENT';
  payer_member_id: string;
  payer_name_snapshot: string;
  amount_paise: string;
  description: string;
  category: string | null;
  occurred_at: string;
  correction_of: string | null;
}

export function HistoryScreen() {
  const { session } = useAuth();
  const [selectedEntry, setSelectedEntry] = useState<{ id: string; description: string; amountPaise: bigint } | null>(null);
  const [isCorrectionVisible, setIsCorrectionVisible] = useState(false);

  // Fetch current member id
  const currentMemberQuery = useQuery({
    queryKey: ['current-member-id', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('current_member_id');
      if (error) throw error;
      return data as string;
    },
  });

  const { data: entries, isLoading, isError, refetch } = useQuery<LedgerItem[]>({
    queryKey: ['ledger-history'],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('ledger_entries')
        .select('id, entry_type, payer_member_id, payer_name_snapshot, amount_paise, description, category, occurred_at, correction_of')
        .order('occurred_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const currentMemberId = currentMemberQuery.data;

  const handleCorrect = (item: LedgerItem) => {
    setSelectedEntry({
      id: item.id,
      description: item.description,
      amountPaise: BigInt(item.amount_paise),
    });
    setIsCorrectionVisible(true);
  };

  if (isLoading || currentMemberQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#243f7a" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Could not load transaction history.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>AUDITABLE RECORD</Text>
            <Text style={styles.title}>Group Ledger</Text>
            <Text style={styles.subtitle}>
              Every entry is permanent and verifiable. Corrections append reversal and adjustment rows.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No expenses recorded</Text>
            <Text style={styles.emptySubtitle}>All recorded transactions for the group will appear here.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isReversal = item.entry_type === 'REVERSAL';
          const isAdjustment = item.entry_type === 'ADJUSTMENT';
          const isCallerPayer = currentMemberId === item.payer_member_id;
          const canCorrect = item.entry_type === 'EXPENSE' && isCallerPayer;

          return (
            <View style={[styles.card, isReversal && styles.cardReversed]}>
              <View style={styles.cardHeader}>
                <View style={styles.badgeContainer}>
                  <View
                    style={[
                      styles.typeBadge,
                      isReversal && styles.badgeReversal,
                      isAdjustment && styles.badgeAdjustment,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        isReversal && styles.textReversal,
                        isAdjustment && styles.textAdjustment,
                      ]}
                    >
                      {item.entry_type}
                    </Text>
                  </View>
                  {item.category && <Text style={styles.categoryText}>{item.category}</Text>}
                </View>
                <Text style={styles.dateText}>
                  {new Intl.DateTimeFormat('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Kolkata',
                  }).format(new Date(item.occurred_at))}
                </Text>
              </View>

              <View style={styles.rowBetween}>
                <View style={styles.infoCol}>
                  <Text style={[styles.desc, isReversal && styles.strikethrough]}>{item.description}</Text>
                  <Text style={styles.payer}>Paid by {item.payer_name_snapshot}</Text>
                </View>
                <Text style={[styles.amount, isReversal && styles.strikethrough]}>
                  {isReversal ? '-' : ''}
                  {formatInr(BigInt(item.amount_paise))}
                </Text>
              </View>

              {canCorrect && (
                <View style={styles.footerRow}>
                  <Pressable style={styles.correctButton} onPress={() => handleCorrect(item)}>
                    <Text style={styles.correctButtonText}>Entered incorrectly? Correct</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
      />

      <CorrectionModal
        visible={isCorrectionVisible}
        onClose={() => {
          setIsCorrectionVisible(false);
          setSelectedEntry(null);
        }}
        originalEntry={selectedEntry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 20, gap: 14 },
  header: { marginBottom: 12 },
  eyebrow: { color: '#64748b', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#0f172a', fontSize: 26, fontWeight: '700', marginTop: 4 },
  subtitle: { color: '#475569', fontSize: 14, marginTop: 4, lineHeight: 20 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  cardReversed: { backgroundColor: '#f1f5f9', opacity: 0.8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badgeContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: '#eff6ff' },
  badgeReversal: { backgroundColor: '#fee2e2' },
  badgeAdjustment: { backgroundColor: '#fef3c7' },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#1d4ed8' },
  textReversal: { color: '#b91c1c' },
  textAdjustment: { color: '#b45309' },
  categoryText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  dateText: { fontSize: 12, color: '#94a3b8' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  infoCol: { flex: 1, marginRight: 12 },
  desc: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  strikethrough: { textDecorationLine: 'line-through', color: '#94a3b8' },
  payer: { fontSize: 13, color: '#64748b', marginTop: 2 },
  amount: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  footerRow: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8, marginTop: 4, alignItems: 'flex-start' },
  correctButton: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#f1f5f9' },
  correctButtonText: { fontSize: 12, color: '#243f7a', fontWeight: '600' },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#334155' },
  emptySubtitle: { fontSize: 14, color: '#64748b', marginTop: 6, textAlign: 'center' },
  errorText: { color: '#dc2626', fontSize: 15 },
});
