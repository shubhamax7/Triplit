import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { z } from 'zod';
import { createBilateralTransaction } from './api';
import { parseAmountToPaise } from '../../lib/currency';
import { getSupabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import type { RootStackParamList } from '../../navigation/types';

const pairExpenseSchema = z.object({
  amount: z
    .string()
    .min(1, 'Enter an amount')
    .refine((val) => /^\d+(\.\d{1,2})?$/.test(val), 'Maximum 2 decimal places allowed'),
  description: z
    .string()
    .trim()
    .min(1, 'Description is required')
    .max(200, 'Description cannot exceed 200 characters'),
  category: z.string().trim().max(60, 'Category too long').optional(),
});

type PairExpenseFormData = z.infer<typeof pairExpenseSchema>;

export function AddPairExpenseScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'AddPairExpense'>) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const idempotencyKey = useRef(crypto.randomUUID());

  const initialCounterpartyId = route.params?.counterpartyId;
  const [selectedCounterpartyId, setSelectedCounterpartyId] = useState<string | null>(
    initialCounterpartyId ?? null
  );

  const currentMemberQuery = useQuery({
    queryKey: ['current-member-id', session?.user?.id],
    queryFn: async () => {
      const { data, error } = await getSupabase().rpc('current_member_id');
      if (error) throw error;
      return data as string;
    },
  });

  const currentMemberId = currentMemberQuery.data;

  // Query other members for the counterparty selection
  const otherMembersQuery = useQuery({
    queryKey: ['other-members', currentMemberId],
    queryFn: async () => {
      if (!currentMemberId) return [];
      const { data, error } = await getSupabase()
        .from('members')
        .select('id, display_name, email')
        .neq('id', currentMemberId)
        .eq('is_active', true);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(currentMemberId),
  });

  const otherMembers = otherMembersQuery.data ?? [];

  // Auto-select first counterparty if not set
  if (!selectedCounterpartyId && otherMembers.length > 0) {
    setSelectedCounterpartyId(otherMembers[0].id);
  }

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<PairExpenseFormData>({
    resolver: zodResolver(pairExpenseSchema),
    defaultValues: { amount: '', description: '', category: '' },
  });

  const descriptionValue = watch('description') || '';

  const mutation = useMutation({
    mutationFn: createBilateralTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bilateral-pairs'] });
      queryClient.invalidateQueries({ queryKey: ['bilateral-pair-detail'] });
      reset();
      idempotencyKey.current = crypto.randomUUID();
      navigation.goBack();
    },
    onError: (err: any) => {
      Alert.alert(
        'Submission Failed',
        err?.message || 'Could not record bilateral expense. Tap to retry.'
      );
    },
  });

  const onSubmit = (data: PairExpenseFormData) => {
    if (!selectedCounterpartyId) {
      Alert.alert('Selection Required', 'Please select who this expense was for.');
      return;
    }

    try {
      const amountPaise = parseAmountToPaise(data.amount);
      if (amountPaise <= 0n) {
        Alert.alert('Invalid Amount', 'Amount must be greater than zero.');
        return;
      }

      mutation.mutate({
        idempotencyKey: idempotencyKey.current,
        counterpartyMemberId: selectedCounterpartyId,
        amountPaise,
        description: data.description.trim(),
        category: data.category?.trim() || undefined,
        occurredAt: new Date().toISOString(),
      });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', default: undefined })}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            You are always recorded as the payer. Select which of the other two members this was paid for.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Paid For</Text>
          <View style={styles.counterpartyRow}>
            {otherMembers.map((member) => {
              const isSelected = selectedCounterpartyId === member.id;
              return (
                <Pressable
                  key={member.id}
                  style={[styles.counterpartyBtn, isSelected && styles.counterpartyBtnActive]}
                  onPress={() => setSelectedCounterpartyId(member.id)}
                >
                  <Text style={[styles.counterpartyText, isSelected && styles.counterpartyTextActive]}>
                    {member.display_name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Amount (₹)</Text>
          <Controller
            control={control}
            name="amount"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[styles.input, styles.amountInput]}
                placeholder="0.00"
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {errors.amount && <Text style={styles.errorText}>{errors.amount.message}</Text>}

          <View style={styles.rowBetween}>
            <Text style={styles.label}>Description</Text>
            <Text style={styles.charCounter}>{descriptionValue.length}/200</Text>
          </View>
          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={styles.input}
                placeholder="Concert ticket, taxi ride, dinner…"
                placeholderTextColor="#94a3b8"
                maxLength={200}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {errors.description && <Text style={styles.errorText}>{errors.description.message}</Text>}

          <Text style={styles.label}>Category (Optional)</Text>
          <Controller
            control={control}
            name="category"
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={styles.input}
                placeholder="Personal, Travel, Food…"
                placeholderTextColor="#94a3b8"
                maxLength={60}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {errors.category && <Text style={styles.errorText}>{errors.category.message}</Text>}
        </View>

        <Pressable
          style={[styles.submitButton, mutation.isPending && styles.disabledButton]}
          onPress={handleSubmit(onSubmit)}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitButtonText}>Record Pair Expense</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { padding: 20, gap: 18 },
  banner: {
    backgroundColor: '#eff6ff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  bannerText: { color: '#1e40af', fontSize: 13, lineHeight: 18 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  label: { color: '#334155', fontSize: 13, fontWeight: '600' },
  counterpartyRow: { flexDirection: 'row', gap: 10 },
  counterpartyBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
  },
  counterpartyBtnActive: {
    borderColor: '#243f7a',
    backgroundColor: '#eff6ff',
  },
  counterpartyText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  counterpartyTextActive: { color: '#1d4ed8', fontWeight: '700' },
  amountInput: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#0f172a',
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  charCounter: { fontSize: 12, color: '#94a3b8' },
  errorText: { color: '#dc2626', fontSize: 12, marginTop: -4 },
  submitButton: {
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
  disabledButton: { opacity: 0.7 },
  submitButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
