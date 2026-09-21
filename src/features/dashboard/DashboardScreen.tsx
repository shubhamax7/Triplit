import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCurrentGroupSummary } from '../ledger/queries';
import { useBilateralPairs } from '../bilateral/queries';
import { formatInr } from '../../lib/currency';
import { useAuth } from '../auth/AuthProvider';
import { getSupabase } from '../../lib/supabase';
import type { RootStackParamList } from '../../navigation/types';

export function DashboardScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Dashboard'>) {
  const { session, signOut } = useAuth();
  const summary = useCurrentGroupSummary();

  const currentMemberQuery = useQuery({
    queryKey: ['current-member-id', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('current_member_id');
      if (error) throw error;
      return data as string;
    },
  });

  const currentMemberId = currentMemberQuery.data;
  const pairSummary = useBilateralPairs(currentMemberId);

  const memberName = (id: string) =>
    summary.data?.members.find((member) => member.id === id)?.display_name ?? 'Member';

  const onRefresh = async () => {
    await Promise.all([summary.refetch(), pairSummary.refetch()]);
  };

  const isRefreshing = summary.isRefetching || pairSummary.isRefetching;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>CURRENT PERIOD · ASIA/KOLKATA</Text>
        <Text style={styles.heading}>
          {new Intl.DateTimeFormat('en-IN', {
            month: 'long',
            year: 'numeric',
            timeZone: 'Asia/Kolkata',
          }).format(new Date())}
        </Text>
      </View>

      {summary.isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#243f7a" />
        </View>
      ) : summary.isError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            Could not load the group ledger. Pull to retry after checking your connection.
          </Text>
        </View>
      ) : summary.data ? (
        <View style={styles.groupSection}>
          {/* Main Total Card */}
          <View style={styles.mainCard}>
            <Text style={styles.cardLabel}>Group Ledger Total Spend</Text>
            <Text style={styles.mainMoney}>{formatInr(summary.data.totalPaise)}</Text>
            <Text style={styles.cardSubtext}>
              Split equally among all 3 members. Bilateral expenses are strictly excluded.
            </Text>
          </View>

          {/* Member Balances Breakdown */}
          <View style={styles.balancesContainer}>
            <Text style={styles.sectionTitle}>Net Member Positions</Text>
            {summary.data.balances.map((balance) => {
              const isCreditor = balance.netPaise > 0n;
              const isDebtor = balance.netPaise < 0n;
              const isSettled = balance.netPaise === 0n;
              const isUser = balance.memberId === currentMemberId;

              return (
                <View key={balance.memberId} style={styles.balanceRow}>
                  <View>
                    <Text style={styles.balanceMemberName}>
                      {memberName(balance.memberId)} {isUser ? '(You)' : ''}
                    </Text>
                    <Text style={styles.contributionText}>
                      Paid {formatInr(balance.contributionPaise)} · Share {formatInr(balance.sharePaise)}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.netBalanceText,
                      isCreditor && styles.receive,
                      isDebtor && styles.pay,
                      isSettled && styles.settled,
                    ]}
                  >
                    {isSettled
                      ? 'Settled'
                      : isCreditor
                      ? `Should receive ${formatInr(balance.netPaise)}`
                      : `Should pay ${formatInr(-balance.netPaise)}`}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Group Settlement Card */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Group Settlement (Minimum Transfers)</Text>
            {summary.data.transfers.length === 0 ? (
              <Text style={styles.mutedText}>Everyone is currently settled for this month.</Text>
            ) : (
              summary.data.transfers.map((transfer) => (
                <View
                  key={`${transfer.fromMemberId}-${transfer.toMemberId}`}
                  style={styles.transferRow}
                >
                  <Text style={styles.transferText}>
                    <Text style={styles.bold}>{memberName(transfer.fromMemberId)}</Text> should pay{' '}
                    <Text style={styles.bold}>{memberName(transfer.toMemberId)}</Text>{' '}
                    <Text style={styles.transferAmount}>{formatInr(transfer.amountPaise)}</Text>
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      ) : null}

      {/* Primary Action Button */}
      <Pressable
        onPress={() => navigation.navigate('AddExpense')}
        style={styles.primaryAction}
      >
        <Text style={styles.primaryActionText}>+ Add Group Expense</Text>
      </Pressable>

      {/* BILATERAL SECTION (Strict separation) */}
      <View style={styles.bilateralSection}>
        <View style={styles.bilateralHeader}>
          <Text style={styles.bilateralEyebrow}>SEPARATE SUBSYSTEM</Text>
          <Text style={styles.bilateralTitle}>Your Pair Expenses</Text>
          <Text style={styles.bilateralDesc}>
            Direct two-person expenses. Completely isolated from the group pool.
          </Text>
        </View>

        {pairSummary.isLoading ? (
          <ActivityIndicator color="#243f7a" />
        ) : (
          <View style={styles.pairsGrid}>
            {pairSummary.data?.map((pair) => {
              const isCreditor = pair.netPaise > 0n;
              const isDebtor = pair.netPaise < 0n;

              return (
                <Pressable
                  key={pair.counterpartyId}
                  style={styles.pairCard}
                  onPress={() =>
                    navigation.navigate('PairDetail', {
                      counterpartyId: pair.counterpartyId,
                      counterpartyName: pair.counterpartyName,
                    })
                  }
                >
                  <Text style={styles.pairCardName}>{pair.counterpartyName}</Text>
                  <Text
                    style={[
                      styles.pairCardAmount,
                      isCreditor && styles.receive,
                      isDebtor && styles.pay,
                    ]}
                  >
                    {pair.netPaise === 0n
                      ? 'Settled'
                      : isCreditor
                      ? `+${formatInr(pair.netPaise)}`
                      : `-${formatInr(-pair.netPaise)}`}
                  </Text>
                  <Text style={styles.pairCardHint}>
                    {pair.netPaise === 0n
                      ? 'No outstanding balance'
                      : isCreditor
                      ? 'Owes you'
                      : 'You owe'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          onPress={() => navigation.navigate('PairExpenses')}
          style={styles.secondaryPairAction}
        >
          <Text style={styles.secondaryPairActionText}>Manage Pair Expenses →</Text>
        </Pressable>
      </View>

      {/* Navigation Grid */}
      <View style={styles.navGrid}>
        <Pressable
          onPress={() => navigation.navigate('History')}
          style={styles.navButton}
        >
          <Text style={styles.navButtonText}>Group History</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('MonthlySummary')}
          style={styles.navButton}
        >
          <Text style={styles.navButtonText}>Periods & Close</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('Clearance')}
          style={styles.navButton}
        >
          <Text style={styles.navButtonText}>Clearance (3/3)</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('Members')}
          style={styles.navButton}
        >
          <Text style={styles.navButtonText}>Members</Text>
        </Pressable>
      </View>

      {/* Sign out */}
      <Pressable onPress={() => void signOut()} style={styles.signOutBtn}>
        <Text style={styles.signOutText}>Sign out of Triplit</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  header: { marginBottom: 4 },
  eyebrow: { color: '#64748b', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  heading: { color: '#0f172a', fontSize: 26, fontWeight: '800', marginTop: 4 },
  loaderContainer: { padding: 40, alignItems: 'center' },
  errorBox: { backgroundColor: '#fee2e2', padding: 16, borderRadius: 12 },
  errorText: { color: '#dc2626', fontSize: 14 },
  groupSection: { gap: 16 },
  mainCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    gap: 8,
  },
  cardLabel: { color: '#64748b', fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  mainMoney: { color: '#0f172a', fontSize: 32, fontWeight: '800' },
  cardSubtext: { color: '#64748b', fontSize: 13, lineHeight: 18 },
  balancesContainer: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginLeft: 2 },
  balanceRow: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  balanceMemberName: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  contributionText: { fontSize: 12, color: '#64748b', marginTop: 2 },
  netBalanceText: { fontSize: 14, fontWeight: '700' },
  receive: { color: '#059669' },
  pay: { color: '#dc2626' },
  settled: { color: '#64748b' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  mutedText: { color: '#64748b', fontSize: 13 },
  transferRow: { paddingVertical: 4 },
  transferText: { fontSize: 14, color: '#334155' },
  bold: { fontWeight: '700', color: '#0f172a' },
  transferAmount: { fontWeight: '700', color: '#243f7a' },
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
  bilateralSection: {
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 14,
  },
  bilateralHeader: { gap: 2 },
  bilateralEyebrow: { fontSize: 10, fontWeight: '700', color: '#64748b', letterSpacing: 1.1 },
  bilateralTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  bilateralDesc: { fontSize: 12, color: '#64748b' },
  pairsGrid: { flexDirection: 'row', gap: 10 },
  pairCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 4,
  },
  pairCardName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  pairCardAmount: { fontSize: 18, fontWeight: '800' },
  pairCardHint: { fontSize: 11, color: '#94a3b8' },
  secondaryPairAction: {
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  secondaryPairActionText: { fontSize: 13, fontWeight: '700', color: '#243f7a' },
  navGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  navButton: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  navButtonText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  signOutBtn: { alignItems: 'center', paddingVertical: 10 },
  signOutText: { color: '#64748b', fontSize: 14, fontWeight: '500' },
});
