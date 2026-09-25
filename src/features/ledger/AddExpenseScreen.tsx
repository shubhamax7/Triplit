import React, { useRef } from 'react';
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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { z } from 'zod';
import { createExpense } from './api';
import { parseAmountToPaise } from '../../lib/currency';
import { generateUUID } from '../../lib/uuid';
import type { RootStackParamList } from '../../navigation/types';

const expenseSchema = z.object({
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

type ExpenseFormData = z.infer<typeof expenseSchema>;

export function AddExpenseScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'AddExpense'>) {
  const queryClient = useQueryClient();
  const idempotencyKey = useRef(generateUUID());

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { amount: '', description: '', category: '' },
  });

  const descriptionValue = watch('description') || '';

  const mutation = useMutation({
    mutationFn: createExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-summary'] });
      queryClient.invalidateQueries({ queryKey: ['ledger-history'] });
      reset();
      idempotencyKey.current = generateUUID();
      navigation.goBack();
    },
    onError: (err: any) => {
      if (err?.message?.includes('PERIOD_CLOSED')) {
        Alert.alert(
          'Period Closed',
          'The accounting period for this expense is closed. Go to Monthly Summary to request a period reopen before adding late expenses.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'View Periods', onPress: () => navigation.navigate('MonthlySummary') },
          ]
        );
      } else {
        Alert.alert('Submission Failed', err?.message || 'Tap to retry. The same idempotency key will prevent duplication.');
      }
    },
  });

  const onSubmit = (data: ExpenseFormData) => {
    try {
      const amountPaise = parseAmountToPaise(data.amount);
      if (amountPaise <= 0n) {
        Alert.alert('Invalid Amount', 'Expense must be greater than zero.');
        return;
      }
      mutation.mutate({
        idempotencyKey: idempotencyKey.current,
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
            Payer identity is securely derived from your active session. All 3 members share this expense equally.
          </Text>
        </View>

        <View style={styles.card}>
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
                placeholder="Groceries, dinner, internet bill…"
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
                placeholder="Food, Housing, Utilities, Travel…"
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
            <Text style={styles.submitButtonText}>Submit Group Expense</Text>
          )}
        </Pressable>

        {mutation.isError && (
          <Text style={styles.retryHint}>
            Failed to record expense. You can tap submit again — the server guarantees idempotency.
          </Text>
        )}
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
  retryHint: { color: '#dc2626', fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
