import React from 'react';
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
import { useBilateralPairs } from './queries';
import { formatInr } from '../../lib/currency';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { RootStackParamList } from '../../navigation/types';

export function PairExpensesScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'PairExpenses'>) {
  const { session } = useAuth();

  const currentMemberQuery = useQuery({
    queryKey: ['current-member-id', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('current_member_id');
      if (error) throw error;
      return data as string;
    },
  });

  const currentMemberId = currentMemberQuery.data;
  const { data: pairs, isLoading, isError, refetch } = useBilateralPairs(currentMemberId);

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
        <Text style={styles.errorText}>Could not load bilateral pairs.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={pairs}
        keyExtractor={(item) => item.counterpartyId}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>INDEPENDENT SUBSYSTEM</Text>
            <Text style={styles.title}>Pair Expenses</Text>
            <Text style={styles.subtitle}>
              Bilateral expenses are visible strictly to the two participating members and NEVER affect the main group ledger or settlement.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isCreditor = item.netPaise > 0n;
          const isDebtor = item.netPaise < 0n;
          const isSettled = item.netPaise === 0n;

          return (
            <Pressable
              style={styles.pairCard}
              onPress={() =>
                navigation.navigate('PairDetail', {
                  counterpartyId: item.counterpartyId,
                  counterpartyName: item.counterpartyName,
                })
              }
            >
              <View style={styles.cardTop}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>{item.counterpartyName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={styles.pairName}>You & {item.counterpartyName}</Text>
                  <Text style={styles.txCount}>{item.transactions.length} transactions</Text>
                </View>
              </View>

              <View style={styles.balanceSection}>
                <Text
                  style={[
                    styles.balanceText,
                    isCreditor && styles.textCreditor,
                    isDebtor && styles.textDebtor,
                    isSettled && styles.textSettled,
                  ]}
                >
                  {isSettled
                    ? 'All settled up'
                    : isCreditor
                    ? `${item.counterpartyName} should pay you ${formatInr(item.netPaise)}`
                    : `You should pay ${item.counterpartyName} ${formatInr(-item.netPaise)}`}
                </Text>
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.viewDetailText}>View history & settlement →</Text>
              </View>
            </Pressable>
          );
        }}
      />

      <View style={styles.floatingButtonContainer}>
        <Pressable
          style={styles.primaryAction}
          onPress={() => navigation.navigate('AddPairExpense', {})}
        >
          <Text style={styles.primaryActionText}>+ Add Pair Expense</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 20, paddingBottom: 90, gap: 16 },
  header: { marginBottom: 12 },
  eyebrow: { color: '#64748b', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#0f172a', fontSize: 26, fontWeight: '700', marginTop: 4 },
  subtitle: { color: '#475569', fontSize: 14, marginTop: 4, lineHeight: 20 },
  pairCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    gap: 14,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#1d4ed8' },
  cardMeta: { flex: 1 },
  pairName: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  txCount: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  balanceSection: {
    backgroundColor: '#f8fafc',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  balanceText: { fontSize: 15, fontWeight: '700' },
  textCreditor: { color: '#059669' },
  textDebtor: { color: '#dc2626' },
  textSettled: { color: '#64748b' },
  cardFooter: { flexDirection: 'row', justifyContent: 'flex-end' },
  viewDetailText: { fontSize: 13, color: '#243f7a', fontWeight: '600' },
  floatingButtonContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  primaryAction: {
    backgroundColor: '#243f7a',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#243f7a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryActionText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  errorText: { color: '#dc2626', fontSize: 15 },
});
