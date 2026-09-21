import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { z } from 'zod';

import { AuthProvider, useAuth } from './src/features/auth/AuthProvider';
import { isSupabaseConfigured } from './src/lib/supabase';
import type { RootStackParamList } from './src/navigation/types';

import { DashboardScreen } from './src/features/dashboard/DashboardScreen';
import { AddExpenseScreen } from './src/features/ledger/AddExpenseScreen';
import { HistoryScreen } from './src/features/ledger/HistoryScreen';
import { MonthlySummaryScreen } from './src/features/periods/MonthlySummaryScreen';
import { ClearanceScreen } from './src/features/clearance/ClearanceScreen';
import { MembersScreen } from './src/features/members/MembersScreen';
import { PairExpensesScreen } from './src/features/bilateral/PairExpensesScreen';
import { PairDetailScreen } from './src/features/bilateral/PairDetailScreen';
import { AddPairExpenseScreen } from './src/features/bilateral/AddPairExpenseScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export default function App() {
  if (!isSupabaseConfigured) {
    return <SetupScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppGate />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function SetupScreen() {
  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.centered}>
        <Text style={styles.eyebrow}>TRIPLIT</Text>
        <Text style={styles.title}>Ready for a secure Supabase connection</Text>
        <Text style={styles.muted}>
          Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to your .env file.
          Do not add a service-role key to the mobile client.
        </Text>
      </View>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

function AppGate() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#243f7a" />
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: '#f8fafc' },
          headerTitleStyle: { color: '#0f172a', fontWeight: '700' },
          headerTintColor: '#243f7a',
          contentStyle: styles.page,
        }}
      >
        <Stack.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ title: 'Triplit' }}
        />
        <Stack.Screen
          name="AddExpense"
          component={AddExpenseScreen}
          options={{ title: 'Add Group Expense' }}
        />
        <Stack.Screen
          name="History"
          component={HistoryScreen}
          options={{ title: 'Group History' }}
        />
        <Stack.Screen
          name="MonthlySummary"
          component={MonthlySummaryScreen}
          options={{ title: 'Accounting Periods' }}
        />
        <Stack.Screen
          name="Clearance"
          component={ClearanceScreen}
          options={{ title: '3-of-3 Clearance' }}
        />
        <Stack.Screen
          name="Members"
          component={MembersScreen}
          options={{ title: 'Group Members' }}
        />
        <Stack.Screen
          name="PairExpenses"
          component={PairExpensesScreen}
          options={{ title: 'Pair Expenses' }}
        />
        <Stack.Screen
          name="PairDetail"
          component={PairDetailScreen}
          options={({ route }) => ({ title: `You & ${route.params.counterpartyName}` })}
        />
        <Stack.Screen
          name="AddPairExpense"
          component={AddPairExpenseScreen}
          options={{ title: 'Add Pair Expense' }}
        />
      </Stack.Navigator>
      <StatusBar style="dark" />
    </NavigationContainer>
  );
}

function LoginScreen() {
  const { signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    if (!z.string().email().safeParse(email).success) {
      return Alert.alert('Invalid Email', 'Please enter a valid email address.');
    }
    try {
      setIsSubmitting(true);
      await signInWithMagicLink(email.trim().toLowerCase());
      setSent(true);
    } catch (error: any) {
      Alert.alert(
        'Could not send sign-in link',
        error instanceof Error ? error.message : 'Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.centered}>
        <Text style={styles.eyebrow}>TRIPLIT</Text>
        <Text style={styles.title}>The shared ledger for three.</Text>
        <Text style={styles.muted}>
          Sign in with your authorized email to access the immutable group and bilateral ledgers.
        </Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="member@example.com"
          placeholderTextColor="#94a3b8"
          style={styles.input}
          value={email}
        />
        <View style={styles.buttonWrapper}>
          <Button
            disabled={isSubmitting}
            onPress={() => void submit()}
            title={isSubmitting ? 'Sending…' : 'Send Magic Link'}
            color="#243f7a"
          />
        </View>
        {sent && (
          <Text style={styles.success}>
            Check your inbox for the secure sign-in link.
          </Text>
        )}
      </View>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, justifyContent: 'center', padding: 24 },
  eyebrow: { color: '#64748b', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: '#0f172a', fontSize: 28, fontWeight: '800', marginTop: 8 },
  muted: { color: '#64748b', fontSize: 15, lineHeight: 22, marginTop: 6 },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 16,
    marginTop: 20,
    padding: 14,
    color: '#0f172a',
  },
  buttonWrapper: { marginTop: 14 },
  success: { color: '#059669', marginTop: 14, fontWeight: '600' },
});
