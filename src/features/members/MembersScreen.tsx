import React from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '../../lib/supabase';

interface MemberItem {
  id: string;
  email: string;
  display_name: string;
  member_order: number;
  is_active: boolean;
  created_at: string;
}

export function MembersScreen() {
  const { data: members, isLoading, isError, refetch } = useQuery<MemberItem[]>({
    queryKey: ['group-members'],
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('members')
        .select('id, email, display_name, member_order, is_active, created_at')
        .order('member_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

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
        <Text style={styles.errorText}>Could not load group members.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerBox}>
        <Text style={styles.eyebrow}>FIXED MEMBERSHIP</Text>
        <Text style={styles.title}>Group Members</Text>
        <Text style={styles.description}>
          Triplit is an immutable, equal-share ledger strictly bounded to exactly 3 members. Member order determines deterministic remainder paise allocation.
        </Text>
      </View>

      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.orderBadge}>
              <Text style={styles.orderText}>#{item.member_order}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{item.display_name}</Text>
              <Text style={styles.email}>{item.email}</Text>
              <View style={styles.badgeRow}>
                <View style={[styles.statusBadge, item.is_active ? styles.activeBadge : styles.inactiveBadge]}>
                  <Text style={[styles.statusText, item.is_active ? styles.activeText : styles.inactiveText]}>
                    {item.is_active ? 'Active' : 'Inactive'}
                  </Text>
                </View>
                <Text style={styles.note}>Order #{item.member_order} remainder priority</Text>
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  headerBox: { marginBottom: 20 },
  eyebrow: { color: '#64748b', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#0f172a', fontSize: 26, fontWeight: '700', marginTop: 4 },
  description: { color: '#475569', fontSize: 14, lineHeight: 20, marginTop: 6 },
  list: { gap: 14 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  orderBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  orderText: { color: '#1d4ed8', fontWeight: '700', fontSize: 16 },
  info: { flex: 1 },
  name: { color: '#0f172a', fontSize: 17, fontWeight: '600' },
  email: { color: '#64748b', fontSize: 13, marginTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  activeBadge: { backgroundColor: '#ecfdf5' },
  inactiveBadge: { backgroundColor: '#fef2f2' },
  statusText: { fontSize: 11, fontWeight: '600' },
  activeText: { color: '#059669' },
  inactiveText: { color: '#dc2626' },
  note: { color: '#94a3b8', fontSize: 11 },
  errorText: { color: '#dc2626', fontSize: 15 },
});
