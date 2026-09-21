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
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useBilateralPairDetail } from './queries';
import { formatInr } from '../../lib/currency';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { BilateralCorrectionModal } from './BilateralCorrectionModal';
import type { BilateralTransactionRecord } from './api';
import type { RootStackParamList } from '../../navigation/types';

export function PairDetailScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'PairDetail'>) {
  const { counterpartyId, counterpartyName } = route.params;
  const { session } = useAuth();
  const [selectedEntry, setSelectedEntry] = useState<{ id: string; description: string; amountPaise: bigint } | null>(null);
  const [isCorrectionVisible, setIsCorrectionVisible] = useState(false);

  const currentMemberQuery = useQuery({
    queryKey: ['current-member-id', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('current_member_id');
      if (error) throw error;
      return data as string;
    },
  });

  const currentMemberId = currentMemberQuery.data;
  const { data: detail, isLoading, isError, refetch } = useBilateralPairDetail(
    currentMemberId,
    counterpartyId
  );

  const handleCorrect = (item: BilateralTransactionRecord) => {
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
        <Text style={styles.errorText}>Could not load pair history.</Text>
      </View>
    );
  }

  const netPaise = detail?.netPaise ?? 0n;
  const isCreditor = netPaise > 0n;
  const isDebtor = netPaise < 0n;
  const isSettled = netPaise === 0n;

  return (
    <View style={styles.container}>
      <FlatList
        data={detail?.transactions ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.settlementWidget}>
              <Text style={styles.widgetEyebrow}>PAIR SETTLEMENT OBLIGATION</Text>
              <Text
                style={[
                  styles.widgetAmount,
                  isCreditor && styles.textCreditor,
                  isDebtor && styles.textDebtor,
                  isSettled && styles.textSettled,
                ]}
              >
                {isSettled
                  ? 'Zero Net Balance'
                  : isCreditor
                  ? `${counterpartyName} should pay you ${formatInr(netPaise)}`
                  : `You should pay ${counterpartyName} ${formatInr(-netPaise)}`}
              </Text>
              <Text style={styles.widgetHint}>
                Strictly 2-person obligation. Never pooled into the 3-member group ledger.
              </Text>
            </View>

            <View style={styles.subHeaderRow}>
              <Text style={styles.sectionTitle}>Transaction History</Text>
              <Pressable
                style={styles.addBtn}
                onPress={() => navigation.navigate('AddPairExpense', { counterpartyId })}
              >
                <Text style={styles.addBtnText}>+ Add Expense</Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No pair expenses yet</Text>
            <Text style={styles.emptySubtitle}>
              Expenses between you and {counterpartyName} will be recorded here.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isReversal = item.entry_type === 'BILATERAL_REVERSAL';
          const isAdjustment = item.entry_type === 'BILATERAL_ADJUSTMENT';
          const isCallerPayer = currentMemberId === item.payer_member_id;
          const canCorrect = item.entry_type === 'BILATERAL_EXPENSE' && isCallerPayer;

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
                      {item.entry_type.replace('BILATERAL_', '')}
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
                  <Text style={styles.payer}>
                    {isCallerPayer ? 'You paid' : `${item.payer_name_snapshot} paid`}
                  </Text>
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

      <BilateralCorrectionModal
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
  settlementWidget: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 20,
  },
  widgetEyebrow: { fontSize: 11, fontWeight: '700', color: '#64748b', letterSpacing: 1.1 },
  widgetAmount: { fontSize: 20, fontWeight: '800' },
  widgetHint: { fontSize: 12, color: '#94a3b8', lineHeight: 16 },
  textCreditor: { color: '#059669' },
  textDebtor: { color: '#dc2626' },
  textSettled: { color: '#64748b' },
  subHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  addBtn: {
    backgroundColor: '#243f7a',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  addBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
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
  categoryText: { fontSize: 12, color: '#64748b' },
  dateText: { fontSize: 12, color: '#94a3b8' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  infoCol: { flex: 1, marginRight: 12 },
  desc: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  strikethrough: { textDecorationLine: 'line-through', color: '#94a3b8' },
  payer: { fontSize: 13, color: '#64748b', marginTop: 2 },
  amount: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  footerRow: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8, marginTop: 4 },
  correctButton: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#f1f5f9' },
  correctButtonText: { fontSize: 12, color: '#243f7a', fontWeight: '600' },
  emptyBox: { padding: 30, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#334155' },
  emptySubtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 4 },
  errorText: { color: '#dc2626', fontSize: 15 },
});
