import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCorrection } from './api';
import { formatInr, parseAmountToPaise } from '../../lib/currency';

interface CorrectionModalProps {
  visible: boolean;
  onClose: () => void;
  originalEntry: {
    id: string;
    description: string;
    amountPaise: bigint;
  } | null;
}

export function CorrectionModal({ visible, onClose, originalEntry }: CorrectionModalProps) {
  const queryClient = useQueryClient();
  const reversalKey = useRef(crypto.randomUUID());
  const adjustmentKey = useRef(crypto.randomUUID());

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  const mutation = useMutation({
    mutationFn: createCorrection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-summary'] });
      queryClient.invalidateQueries({ queryKey: ['ledger-history'] });
      Alert.alert('Correction Recorded', 'Reversal and adjustment entries have been added to the append-only ledger.');
      resetForm();
      onClose();
    },
    onError: (err: any) => {
      Alert.alert('Error', err?.message || 'Could not record correction.');
    },
  });

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setCategory('');
    reversalKey.current = crypto.randomUUID();
    adjustmentKey.current = crypto.randomUUID();
  };

  const handleOpen = () => {
    if (originalEntry) {
      setDescription(originalEntry.description);
    }
  };

  const handleSubmit = () => {
    if (!originalEntry) return;
    try {
      const paise = parseAmountToPaise(amount);
      if (paise <= 0n) throw new Error('Amount must be greater than zero.');
      if (!description.trim()) throw new Error('Description is required.');

      mutation.mutate({
        originalId: originalEntry.id,
        reversalKey: reversalKey.current,
        adjustmentKey: adjustmentKey.current,
        newAmountPaise: paise,
        newDescription: description.trim(),
        newCategory: category.trim() || undefined,
      });
    } catch (e: any) {
      Alert.alert('Invalid input', e.message);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onShow={handleOpen} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.eyebrow}>APPEND-ONLY CORRECTION</Text>
          <Text style={styles.title}>Correct Expense</Text>
          <Text style={styles.subtitle}>
            Original: {originalEntry?.description} ({originalEntry ? formatInr(originalEntry.amountPaise) : ''})
          </Text>
          <Text style={styles.notice}>
            Triplit never mutates or deletes ledger records. This creates a linked REVERSAL and a new ADJUSTMENT entry.
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>New Amount (₹)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />

            <Text style={styles.label}>New Description ({description.length}/200)</Text>
            <TextInput
              style={styles.input}
              placeholder="Corrected description"
              maxLength={200}
              value={description}
              onChangeText={setDescription}
            />

            <Text style={styles.label}>Category (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Food, travel, utilities…"
              value={category}
              onChangeText={setCategory}
            />
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onClose} disabled={mutation.isPending}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.confirmBtn} onPress={handleSubmit} disabled={mutation.isPending}>
              {mutation.isPending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.confirmText}>Submit Correction</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', justifyContent: 'flex-end' },
  container: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  eyebrow: { color: '#64748b', fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#0f172a', fontSize: 22, fontWeight: '700', marginTop: 4 },
  subtitle: { color: '#334155', fontSize: 14, fontWeight: '600', marginTop: 4 },
  notice: { color: '#64748b', fontSize: 13, lineHeight: 18, marginTop: 8, backgroundColor: '#f1f5f9', padding: 10, borderRadius: 8 },
  form: { marginTop: 16, gap: 12 },
  label: { color: '#334155', fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#0f172a',
  },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#e2e8f0', alignItems: 'center' },
  cancelText: { color: '#475569', fontWeight: '600' },
  confirmBtn: { flex: 2, padding: 14, borderRadius: 12, backgroundColor: '#243f7a', alignItems: 'center' },
  confirmText: { color: '#ffffff', fontWeight: '700' },
});
