import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closePeriod,
  fetchAccountingPeriods,
  fetchSettlementSnapshot,
  reopenPeriod,
  type AccountingPeriodRecord,
  type SettlementSnapshotRecord,
} from './api';
import { formatInr } from '../../lib/currency';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function MonthlySummaryScreen() {
  const queryClient = useQueryClient();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

  const { data: periods, isLoading, isError, refetch } = useQuery({
    queryKey: ['accounting-periods'],
    queryFn: fetchAccountingPeriods,
  });

  const snapshotQuery = useQuery({
    queryKey: ['settlement-snapshot', selectedPeriodId],
    queryFn: () => (selectedPeriodId ? fetchSettlementSnapshot(selectedPeriodId) : null),
    enabled: Boolean(selectedPeriodId),
  });

  const closeMutation = useMutation({
    mutationFn: closePeriod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      queryClient.invalidateQueries({ queryKey: ['group-summary'] });
      Alert.alert('Period Closed', 'The accounting period was closed and an immutable settlement snapshot was generated.');
    },
    onError: (err: any) => {
      Alert.alert('Error Closing Period', err?.message || 'Failed to close period.');
    },
  });

  const reopenMutation = useMutation({
    mutationFn: reopenPeriod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      queryClient.invalidateQueries({ queryKey: ['group-summary'] });
      Alert.alert('Period Reopened', 'The period is now OPEN. You can record retroactive expenses and close it again.');
    },
    onError: (err: any) => {
      Alert.alert('Error Reopening Period', err?.message || 'Failed to reopen period.');
    },
  });

  const handleClose = (period: AccountingPeriodRecord) => {
    Alert.alert(
      'Close Accounting Period',
      `Close ${MONTH_NAMES[period.month - 1]} ${period.year}? This locks all expenses in this period and generates an immutable settlement snapshot.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm Close', style: 'destructive', onPress: () => closeMutation.mutate(period.id) },
      ]
    );
  };

  const handleReopen = (period: AccountingPeriodRecord) => {
    Alert.alert(
      'Reopen Period',
      `Reopen ${MONTH_NAMES[period.month - 1]} ${period.year}? Existing snapshot will be marked superseded when closed again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm Reopen', onPress: () => reopenMutation.mutate(period.id) },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#243f7a" />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Could not load accounting periods.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={periods}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>MONTHLY PERIODS · ASIA/KOLKATA</Text>
            <Text style={styles.title}>Accounting Periods</Text>
            <Text style={styles.subtitle}>
              Periods track monthly IST boundaries. Closing produces an immutable settlement snapshot.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isOpen = item.status === 'OPEN';
          const isClosed = item.status === 'CLOSED';
          const isSelected = selectedPeriodId === item.id;

          return (
            <View style={styles.periodCard}>
              <Pressable
                onPress={() => setSelectedPeriodId(isSelected ? null : item.id)}
                style={styles.cardHeader}
              >
                <View>
                  <Text style={styles.periodName}>
                    {MONTH_NAMES[item.month - 1]} {item.year}
                  </Text>
                  <Text style={styles.epochText}>Epoch {item.epoch}</Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    isOpen && styles.badgeOpen,
                    isClosed && styles.badgeClosed,
                    item.status === 'ARCHIVED' && styles.badgeArchived,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      isOpen && styles.textOpen,
                      isClosed && styles.textClosed,
                      item.status === 'ARCHIVED' && styles.textArchived,
                    ]}
                  >
                    {item.status}
                  </Text>
                </View>
              </Pressable>

              {isOpen && (
                <View style={styles.actionRow}>
                  <Pressable
                    style={styles.closeBtn}
                    onPress={() => handleClose(item)}
                    disabled={closeMutation.isPending}
                  >
                    {closeMutation.isPending ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Text style={styles.closeBtnText}>Close Period & Lock Settlement</Text>
                    )}
                  </Pressable>
                </View>
              )}

              {isClosed && (
                <View style={styles.actionRow}>
                  <Pressable
                    style={styles.reopenBtn}
                    onPress={() => handleReopen(item)}
                    disabled={reopenMutation.isPending}
                  >
                    <Text style={styles.reopenBtnText}>Reopen for Late Adjustments</Text>
                  </Pressable>
                </View>
              )}

              {isSelected && (
                <View style={styles.snapshotBox}>
                  {snapshotQuery.isLoading ? (
                    <ActivityIndicator size="small" color="#243f7a" />
                  ) : snapshotQuery.data ? (
                    <SnapshotDetails snapshot={snapshotQuery.data} />
                  ) : (
                    <Text style={styles.muted}>No snapshot generated yet for this period.</Text>
                  )}
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

function SnapshotDetails({ snapshot }: { snapshot: SettlementSnapshotRecord }) {
  return (
    <View style={styles.snapshotContent}>
      <View style={styles.rowBetween}>
        <Text style={styles.snapshotTitle}>Settlement Snapshot</Text>
        <Text style={styles.hashText}>Hash: {snapshot.ledger_hash.slice(0, 8)}…</Text>
      </View>
      <Text style={styles.snapshotSpend}>
        Total Group Spend: {formatInr(BigInt(snapshot.total_paise))}
      </Text>

      <Text style={styles.sectionHeader}>Transfers</Text>
      {snapshot.transfers.length === 0 ? (
        <Text style={styles.muted}>Everyone was fully settled.</Text>
      ) : (
        snapshot.transfers.map((t, idx) => (
          <Text key={idx} style={styles.transferText}>
            Member {t.from_member_id.slice(0, 6)} → Member {t.to_member_id.slice(0, 6)}:{' '}
            <Text style={styles.bold}>{formatInr(BigInt(t.amount_paise))}</Text>
          </Text>
        ))
      )}
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
  periodCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  periodName: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  epochText: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeOpen: { backgroundColor: '#ecfdf5' },
  badgeClosed: { backgroundColor: '#eff6ff' },
  badgeArchived: { backgroundColor: '#f1f5f9' },
  statusText: { fontSize: 12, fontWeight: '700' },
  textOpen: { color: '#059669' },
  textClosed: { color: '#1d4ed8' },
  textArchived: { color: '#64748b' },
  actionRow: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  closeBtn: {
    backgroundColor: '#243f7a',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeBtnText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
  reopenBtn: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  reopenBtnText: { color: '#1d4ed8', fontWeight: '600', fontSize: 13 },
  snapshotBox: {
    marginTop: 14,
    padding: 14,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  snapshotContent: { gap: 6 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  snapshotTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  hashText: { fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' },
  snapshotSpend: { fontSize: 15, fontWeight: '600', color: '#334155', marginTop: 4 },
  sectionHeader: { fontSize: 12, fontWeight: '700', color: '#64748b', marginTop: 6, textTransform: 'uppercase' },
  transferText: { fontSize: 13, color: '#334155' },
  bold: { fontWeight: '700', color: '#0f172a' },
  muted: { color: '#64748b', fontSize: 13 },
  errorText: { color: '#dc2626', fontSize: 15 },
});
