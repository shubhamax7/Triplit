import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveClearance,
  cancelClearance,
  executeClearance,
  fetchActiveClearance,
  requestClearance,
} from './api';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

export function ClearanceScreen() {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const currentMemberQuery = useQuery({
    queryKey: ['current-member-id', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('current_member_id');
      if (error) throw error;
      return data as string;
    },
  });

  const { data: clearanceData, isLoading, isError, refetch } = useQuery({
    queryKey: ['active-clearance'],
    queryFn: fetchActiveClearance,
  });

  const requestMutation = useMutation({
    mutationFn: () => requestClearance(crypto.randomUUID()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-clearance'] });
      Alert.alert('Clearance Initiated', 'A 72-hour clearance request has been created. All 3 members must approve before execution.');
    },
    onError: (err: any) => {
      Alert.alert('Failed to Request Clearance', err?.message || 'Could not initiate clearance.');
    },
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: string) => approveClearance(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-clearance'] });
      Alert.alert('Approval Recorded', 'Your approval for ledger clearance has been registered.');
    },
    onError: (err: any) => {
      Alert.alert('Failed to Approve', err?.message || 'Could not approve clearance.');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (requestId: string) => cancelClearance(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['active-clearance'] });
      Alert.alert('Clearance Cancelled', 'The clearance request was successfully cancelled.');
    },
    onError: (err: any) => {
      Alert.alert('Failed to Cancel', err?.message || 'Could not cancel clearance.');
    },
  });

  const executeMutation = useMutation({
    mutationFn: (requestId: string) => executeClearance(requestId),
    onSuccess: (newEpoch) => {
      queryClient.invalidateQueries({ queryKey: ['active-clearance'] });
      queryClient.invalidateQueries({ queryKey: ['group-summary'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-periods'] });
      queryClient.invalidateQueries({ queryKey: ['ledger-history'] });
      Alert.alert('Clearance Executed', `Ledger archived. A new fresh ledger (Epoch ${newEpoch}) has started.`);
    },
    onError: (err: any) => {
      Alert.alert('Execution Failed', err?.message || 'Could not execute clearance.');
    },
  });

  const currentMemberId = currentMemberQuery.data;
  const request = clearanceData?.request;
  const epoch = clearanceData?.epoch ?? 1;

  const hasApproved = request?.approvals?.some((a) => a.approver_member_id === currentMemberId);
  const approvalCount = request?.approvals?.length ?? 0;

  if (isLoading || currentMemberQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#243f7a" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>THREE-OF-THREE CONSENSUS</Text>
        <Text style={styles.title}>Ledger Clearance</Text>
        <Text style={styles.subtitle}>
          Clearing the ledger archives the current epoch and starts fresh with zero balances. Destructive actions strictly require all 3 members to approve in-app.
        </Text>
      </View>

      <View style={styles.epochCard}>
        <Text style={styles.epochLabel}>Current Ledger State</Text>
        <Text style={styles.epochValue}>Epoch {epoch}</Text>
        <Text style={styles.epochHint}>Prior epochs remain permanently queryable in history archives.</Text>
      </View>

      {request ? (
        <View style={styles.requestCard}>
          <View style={styles.statusRow}>
            <Text style={styles.requestTitle}>Clearance Request Active</Text>
            <View style={[styles.statusBadge, request.status === 'APPROVED' ? styles.badgeApproved : styles.badgePending]}>
              <Text style={[styles.statusText, request.status === 'APPROVED' ? styles.textApproved : styles.textPending]}>
                {request.status}
              </Text>
            </View>
          </View>

          <View style={styles.progressContainer}>
            <Text style={styles.progressLabel}>Approvals: {approvalCount}/3 members</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${(approvalCount / 3) * 100}%` }]} />
            </View>
          </View>

          <Text style={styles.expiryText}>
            Expires: {new Date(request.expires_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
          </Text>

          <View style={styles.actionsBox}>
            {request.status === 'PENDING' && !hasApproved && (
              <Pressable
                style={styles.approveBtn}
                onPress={() => approveMutation.mutate(request.id)}
                disabled={approveMutation.isPending}
              >
                <Text style={styles.approveBtnText}>Approve Clearance</Text>
              </Pressable>
            )}

            {request.status === 'APPROVED' && (
              <Pressable
                style={styles.executeBtn}
                onPress={() => executeMutation.mutate(request.id)}
                disabled={executeMutation.isPending}
              >
                {executeMutation.isPending ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.executeBtnText}>Execute Reset to Epoch {epoch + 1}</Text>
                )}
              </Pressable>
            )}

            {request.status === 'PENDING' && (
              <Pressable
                style={styles.cancelBtn}
                onPress={() => cancelMutation.mutate(request.id)}
                disabled={cancelMutation.isPending}
              >
                <Text style={styles.cancelBtnText}>Cancel Request</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyCardTitle}>No Active Clearance Request</Text>
          <Text style={styles.emptyCardText}>
            To archive the current ledger and start fresh with zero balances, start a 72-hour clearance request.
          </Text>
          <Pressable
            style={styles.requestBtn}
            onPress={() => requestMutation.mutate()}
            disabled={requestMutation.isPending}
          >
            {requestMutation.isPending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.requestBtnText}>Request Clearance & Reset</Text>
            )}
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, gap: 16 },
  header: { marginBottom: 8 },
  eyebrow: { color: '#64748b', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#0f172a', fontSize: 26, fontWeight: '700', marginTop: 4 },
  subtitle: { color: '#475569', fontSize: 14, marginTop: 4, lineHeight: 20 },
  epochCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  epochLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', textTransform: 'uppercase' },
  epochValue: { fontSize: 28, fontWeight: '800', color: '#0f172a' },
  epochHint: { fontSize: 13, color: '#64748b' },
  requestCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 12,
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  requestTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeApproved: { backgroundColor: '#ecfdf5' },
  badgePending: { backgroundColor: '#fef3c7' },
  statusText: { fontSize: 12, fontWeight: '700' },
  textApproved: { color: '#059669' },
  textPending: { color: '#b45309' },
  progressContainer: { gap: 6, marginTop: 4 },
  progressLabel: { fontSize: 13, fontWeight: '600', color: '#334155' },
  progressBar: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#243f7a' },
  expiryText: { fontSize: 12, color: '#94a3b8' },
  actionsBox: { gap: 10, marginTop: 8 },
  approveBtn: {
    backgroundColor: '#059669',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  approveBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  executeBtn: {
    backgroundColor: '#b91c1c',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  executeBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  cancelBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelBtnText: { color: '#475569', fontWeight: '600', fontSize: 14 },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    gap: 12,
  },
  emptyCardTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  emptyCardText: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 20 },
  requestBtn: {
    backgroundColor: '#243f7a',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  requestBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
});
