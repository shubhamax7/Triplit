import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCurrentGroupSummary } from '../ledger/queries';
import { formatInr } from '../../lib/currency';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

export function SettlementScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Settlement'>) {
  const summary = useCurrentGroupSummary();

  const memberName = (id: string) =>
    summary.data?.members.find((member) => member.id === id)?.display_name ?? 'Member';

  const onCopySummary = () => {
    if (!summary.data) return;
    const month = new Intl.DateTimeFormat('en-IN', {
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(new Date());

    let message = `Triplit Settlement (${month})\n`;
    message += `Total Group Spend: ${formatInr(summary.data.totalPaise)}\n\n`;

    if (summary.data.transfers.length === 0) {
      message += 'Everyone is settled up for this month.';
    } else {
      message += 'Transfers:\n';
      summary.data.transfers.forEach((t) => {
        message += `• ${memberName(t.fromMemberId)} pays ${memberName(t.toMemberId)}: ${formatInr(t.amountPaise)}\n`;
      });
    }

    Alert.alert('Settlement Summary', message);
  };

  if (summary.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#243f7a" />
      </View>
    );
  }

  if (summary.isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Could not load settlement calculations.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={summary.isRefetching} onRefresh={summary.refetch} />}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>CALCULATED SNAPSHOT · INR</Text>
        <Text style={styles.title}>Group Settlement</Text>
        <Text style={styles.subtitle}>
          Greedy algorithm produces the provably minimal transfer count (maximum 2 transfers for 3 members).
        </Text>
      </View>

      {summary.data && (
        <>
          {/* Main Total Card */}
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total Group Spend</Text>
            <Text style={styles.totalAmount}>{formatInr(summary.data.totalPaise)}</Text>
            <Text style={styles.totalHint}>
              Equal 1/3 base share with remainder paise allocated by stable member order.
            </Text>
          </View>

          {/* Transfers Card */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Minimum Transfers</Text>
              <Pressable style={styles.copyBtn} onPress={onCopySummary}>
                <Text style={styles.copyBtnText}>View Text</Text>
              </Pressable>
            </View>

            {summary.data.transfers.length === 0 ? (
              <View style={styles.settledBox}>
                <Text style={styles.settledText}>✓ Everyone is completely settled for this period.</Text>
              </View>
            ) : (
              <View style={styles.transfersList}>
                {summary.data.transfers.map((transfer, idx) => (
                  <View key={idx} style={styles.transferItem}>
                    <View style={styles.transferAvatars}>
                      <View style={styles.payerCircle}>
                        <Text style={styles.avatarLabel}>{memberName(transfer.fromMemberId).charAt(0)}</Text>
                      </View>
                      <Text style={styles.arrow}>→</Text>
                      <View style={styles.receiverCircle}>
                        <Text style={styles.avatarLabel}>{memberName(transfer.toMemberId).charAt(0)}</Text>
                      </View>
                    </View>

                    <View style={styles.transferDetails}>
                      <Text style={styles.transferSentence}>
                        <Text style={styles.bold}>{memberName(transfer.fromMemberId)}</Text> pays{' '}
                        <Text style={styles.bold}>{memberName(transfer.toMemberId)}</Text>
                      </Text>
                      <Text style={styles.transferAmount}>{formatInr(transfer.amountPaise)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Per-Member Breakdown Table */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Member Balance Breakdown</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 2 }]}>Member</Text>
              <Text style={[styles.th, { flex: 1.5, textAlign: 'right' }]}>Paid (INR)</Text>
              <Text style={[styles.th, { flex: 1.5, textAlign: 'right' }]}>Share (INR)</Text>
              <Text style={[styles.th, { flex: 2, textAlign: 'right' }]}>Net (INR)</Text>
            </View>

            {summary.data.balances.map((b) => {
              const isCreditor = b.netPaise > 0n;
              const isDebtor = b.netPaise < 0n;
              const isSettled = b.netPaise === 0n;

              return (
                <View key={b.memberId} style={styles.tableRow}>
                  <Text style={[styles.tdName, { flex: 2 }]}>{memberName(b.memberId)}</Text>
                  <Text style={[styles.td, { flex: 1.5, textAlign: 'right' }]}>{formatInr(b.contributionPaise)}</Text>
                  <Text style={[styles.td, { flex: 1.5, textAlign: 'right' }]}>{formatInr(b.sharePaise)}</Text>
                  <Text
                    style={[
                      styles.tdBold,
                      { flex: 2, textAlign: 'right' },
                      isCreditor && styles.receive,
                      isDebtor && styles.pay,
                      isSettled && styles.settled,
                    ]}
                  >
                    {isSettled
                      ? '₹0.00'
                      : isCreditor
                      ? `+${formatInr(b.netPaise)}`
                      : `-${formatInr(-b.netPaise)}`}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.footerNote}>
            <Text style={styles.footerText}>
              Sum of net balances is algebraically invariant to ₹0.00. Pair expenses are tracked in the independent Bilateral subsystem.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, gap: 18, paddingBottom: 40 },
  header: { marginBottom: 4 },
  eyebrow: { color: '#64748b', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#0f172a', fontSize: 26, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#475569', fontSize: 14, marginTop: 4, lineHeight: 20 },
  totalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  totalLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', textTransform: 'uppercase' },
  totalAmount: { fontSize: 30, fontWeight: '800', color: '#0f172a' },
  totalHint: { fontSize: 13, color: '#64748b' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 14,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  copyBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#eff6ff' },
  copyBtnText: { fontSize: 12, color: '#1d4ed8', fontWeight: '700' },
  settledBox: { padding: 14, backgroundColor: '#ecfdf5', borderRadius: 10 },
  settledText: { color: '#059669', fontWeight: '600', fontSize: 14 },
  transfersList: { gap: 12 },
  transferItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 14,
  },
  transferAvatars: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  payerCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  receiverCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: { fontWeight: '700', fontSize: 14, color: '#0f172a' },
  arrow: { fontSize: 16, color: '#94a3b8', fontWeight: '700' },
  transferDetails: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  transferSentence: { fontSize: 14, color: '#334155' },
  bold: { fontWeight: '700', color: '#0f172a' },
  transferAmount: { fontSize: 17, fontWeight: '800', color: '#243f7a' },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 8 },
  th: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  tdName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  td: { fontSize: 13, color: '#64748b' },
  tdBold: { fontSize: 14, fontWeight: '700' },
  receive: { color: '#059669' },
  pay: { color: '#dc2626' },
  settled: { color: '#64748b' },
  footerNote: { paddingHorizontal: 4 },
  footerText: { fontSize: 12, color: '#94a3b8', lineHeight: 18 },
  errorText: { color: '#dc2626', fontSize: 15 },
});
