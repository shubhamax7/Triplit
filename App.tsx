import { zodResolver } from '@hookform/resolvers/zod';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, Alert, Button, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { z } from 'zod';
import { AuthProvider, useAuth } from './src/features/auth/AuthProvider';
import { createExpense } from './src/features/ledger/api';
import { useCurrentGroupSummary } from './src/features/ledger/queries';
import { formatInr, parseAmountToPaise } from './src/lib/currency';
import { isSupabaseConfigured } from './src/lib/supabase';

type RootStackParamList = { Dashboard: undefined; AddExpense: undefined; History: undefined; PairExpenses: undefined };
const Stack = createNativeStackNavigator<RootStackParamList>();
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

export default function App() {
  if (!isSupabaseConfigured) return <SetupScreen />;
  return <QueryClientProvider client={queryClient}><AuthProvider><AppGate /></AuthProvider></QueryClientProvider>;
}

function SetupScreen() {
  return <SafeAreaView style={styles.page}><View style={styles.centered}><Text style={styles.eyebrow}>TRIPLIT</Text><Text style={styles.title}>Ready for a secure Supabase connection</Text><Text style={styles.muted}>Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to a local .env file. Do not add a service-role key.</Text></View><StatusBar style="dark" /></SafeAreaView>;
}

function AppGate() {
  const { session, isLoading } = useAuth();
  if (isLoading) return <SafeAreaView style={styles.page}><View style={styles.centered}><ActivityIndicator /></View></SafeAreaView>;
  if (!session) return <LoginScreen />;
  return <NavigationContainer><Stack.Navigator screenOptions={{ headerShadowVisible: false, headerStyle: { backgroundColor: '#f7f8fa' }, contentStyle: styles.page }}><Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Triplit' }} /><Stack.Screen name="AddExpense" component={AddExpenseScreen} options={{ title: 'Add group expense' }} /><Stack.Screen name="History" component={HistoryScreen} options={{ title: 'Group history' }} /><Stack.Screen name="PairExpenses" component={PairExpensesScreen} options={{ title: 'Pair expenses' }} /></Stack.Navigator><StatusBar style="dark" /></NavigationContainer>;
}

function LoginScreen() {
  const { signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  async function submit() {
    if (!z.string().email().safeParse(email).success) return Alert.alert('Enter a valid email address.');
    try { setIsSubmitting(true); await signInWithMagicLink(email.trim().toLowerCase()); setSent(true); }
    catch (error) { Alert.alert('Could not send the sign-in link', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setIsSubmitting(false); }
  }
  return <SafeAreaView style={styles.page}><View style={styles.centered}><Text style={styles.eyebrow}>TRIPLIT</Text><Text style={styles.title}>The shared ledger for three.</Text><Text style={styles.muted}>Only an authorized group member can continue.</Text><TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="you@example.com" style={styles.input} value={email} /><Button disabled={isSubmitting} onPress={() => void submit()} title={isSubmitting ? 'Sending…' : 'Send sign-in link'} />{sent && <Text style={styles.success}>Check your inbox for the sign-in link.</Text>}</View></SafeAreaView>;
}

function DashboardScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Dashboard'>) {
  const { signOut } = useAuth();
  const summary = useCurrentGroupSummary();
  const memberName = (id: string) => summary.data?.members.find((member) => member.id === id)?.display_name ?? 'A member';
  return <ScrollView contentContainerStyle={styles.content}><Text style={styles.eyebrow}>CURRENT PERIOD · IST</Text><Text style={styles.heading}>{new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date())}</Text>{summary.isLoading && <ActivityIndicator />}{summary.isError && <Text style={styles.error}>Could not load the group ledger. Pull to retry after checking your connection.</Text>}{summary.data && <><View style={styles.card}><Text style={styles.cardLabel}>Group ledger total</Text><Text style={styles.money}>{formatInr(summary.data.totalPaise)}</Text><Text style={styles.muted}>Each share is calculated in integer paise. Pair expenses are excluded.</Text></View>{summary.data.balances.map((balance) => <View key={balance.memberId} style={styles.balanceRow}><Text>{memberName(balance.memberId)}</Text><Text style={balance.netPaise >= 0n ? styles.receive : styles.pay}>{balance.netPaise === 0n ? 'Settled' : `${balance.netPaise > 0n ? 'Should receive ' : 'Should pay '}${formatInr(balance.netPaise > 0n ? balance.netPaise : -balance.netPaise)}`}</Text></View>)}<View style={styles.card}><Text style={styles.cardLabel}>Settlement</Text>{summary.data.transfers.length === 0 ? <Text style={styles.muted}>Everyone is settled for this period.</Text> : summary.data.transfers.map((transfer) => <Text key={`${transfer.fromMemberId}-${transfer.toMemberId}`} style={styles.muted}>{memberName(transfer.fromMemberId)} should pay {memberName(transfer.toMemberId)} {formatInr(transfer.amountPaise)}</Text>)}</View></>}<Pressable onPress={() => navigation.navigate('AddExpense')} style={styles.primaryAction}><Text style={styles.primaryActionText}>+ Add group expense</Text></Pressable><View style={styles.row}><Pressable onPress={() => navigation.navigate('History')} style={styles.secondaryAction}><Text>Group history</Text></Pressable><Pressable onPress={() => navigation.navigate('PairExpenses')} style={styles.secondaryAction}><Text>Pair expenses</Text></Pressable></View><Pressable onPress={() => void signOut()}><Text style={styles.signOut}>Sign out</Text></Pressable></ScrollView>;
}

const expenseSchema = z.object({ amount: z.string().min(1), description: z.string().trim().min(1, 'Add a description.').max(200, 'Use 200 characters or fewer.'), category: z.string().trim().max(60).optional() });
type ExpenseForm = z.infer<typeof expenseSchema>;

function AddExpenseScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'AddExpense'>) {
  const idempotencyKey = useRef(crypto.randomUUID());
  const { control, handleSubmit, formState: { errors }, reset } = useForm<ExpenseForm>({ resolver: zodResolver(expenseSchema), defaultValues: { amount: '', description: '', category: '' } });
  const mutation = useMutation({ mutationFn: createExpense, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['period-summary'] }); reset(); idempotencyKey.current = crypto.randomUUID(); navigation.goBack(); } });
  const submit = (form: ExpenseForm) => { try { mutation.mutate({ idempotencyKey: idempotencyKey.current, amountPaise: parseAmountToPaise(form.amount), description: form.description.trim(), category: form.category?.trim() || undefined, occurredAt: new Date().toISOString() }); } catch (error) { Alert.alert('Invalid amount', error instanceof Error ? error.message : 'Try again.'); } };
  return <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', default: undefined })} style={styles.page}><ScrollView contentContainerStyle={styles.content}><Text style={styles.muted}>You are always recorded as the payer. The server derives that identity from your session.</Text><Field control={control} error={errors.amount?.message} keyboardType="decimal-pad" label="Amount (₹)" name="amount" placeholder="0.00" /><Field control={control} error={errors.description?.message} label="Description" name="description" placeholder="Dinner, groceries, rent…" /><Field control={control} error={errors.category?.message} label="Category (optional)" name="category" placeholder="Food" /><Button disabled={mutation.isPending} onPress={handleSubmit(submit)} title={mutation.isPending ? 'Saving…' : 'Add expense'} />{mutation.isError && <Text style={styles.error}>Could not save. Retry uses the same idempotency key, so it cannot create a duplicate.</Text>}</ScrollView></KeyboardAvoidingView>;
}

function Field({ control, error, keyboardType, label, name, placeholder }: { control: ReturnType<typeof useForm<ExpenseForm>>['control']; error?: string; keyboardType?: 'decimal-pad'; label: string; name: keyof ExpenseForm; placeholder: string }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><Controller control={control} name={name} render={({ field: { onBlur, onChange, value } }) => <TextInput keyboardType={keyboardType} onBlur={onBlur} onChangeText={onChange} placeholder={placeholder} style={styles.input} value={value ?? ''} />} />{error && <Text style={styles.error}>{error}</Text>}</View>;
}

function HistoryScreen() { const summary = useCurrentGroupSummary(); if (summary.isLoading) return <View style={styles.centered}><ActivityIndicator /></View>; if (summary.isError) return <View style={styles.content}><Text style={styles.error}>Could not load history.</Text></View>; return <ScrollView contentContainerStyle={styles.content}>{summary.data?.entries.length ? summary.data.entries.map((entry) => <View key={entry.id} style={styles.balanceRow}><View><Text style={entry.entry_type === 'REVERSAL' ? styles.reversed : undefined}>{entry.description}</Text><Text style={styles.muted}>{entry.payer_name_snapshot} · {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(entry.occurred_at))}</Text></View><Text style={entry.entry_type === 'REVERSAL' ? styles.reversed : undefined}>{entry.entry_type === 'REVERSAL' ? '-' : ''}{formatInr(BigInt(entry.amount_paise))}</Text></View>) : <><Text style={styles.heading}>No expenses this month</Text><Text style={styles.muted}>Tap + to add the first group expense.</Text></>}</ScrollView>; }
function PairExpensesScreen() { return <View style={styles.content}><Text style={styles.eyebrow}>SEPARATE LEDGER</Text><Text style={styles.heading}>Pair expenses</Text><Text style={styles.muted}>Pair obligations never alter your group total, group share, or group settlement.</Text><Text style={styles.money}>{formatInr(0n)} net</Text></View>; }

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#f7f8fa' }, centered: { flex: 1, justifyContent: 'center', padding: 24 }, content: { gap: 16, padding: 20 }, eyebrow: { color: '#596780', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 }, title: { color: '#152033', fontSize: 30, fontWeight: '700', marginTop: 8 }, heading: { color: '#152033', fontSize: 24, fontWeight: '700' }, muted: { color: '#596780', fontSize: 15, lineHeight: 22 }, card: { backgroundColor: '#fff', borderRadius: 16, gap: 8, padding: 20 }, cardLabel: { color: '#596780', fontSize: 14, fontWeight: '600' }, money: { color: '#152033', fontSize: 21, fontWeight: '700' }, input: { backgroundColor: '#fff', borderColor: '#d8dee9', borderRadius: 10, borderWidth: 1, fontSize: 16, marginTop: 8, padding: 14 }, field: { gap: 2 }, label: { color: '#24334d', fontSize: 14, fontWeight: '600' }, primaryAction: { alignItems: 'center', backgroundColor: '#243f7a', borderRadius: 12, padding: 16 }, primaryActionText: { color: '#fff', fontWeight: '700' }, row: { flexDirection: 'row', gap: 12 }, secondaryAction: { alignItems: 'center', backgroundColor: '#e9edf5', borderRadius: 12, flex: 1, padding: 14 }, balanceRow: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', padding: 16 }, receive: { color: '#027a48', fontWeight: '700' }, pay: { color: '#b42318', fontWeight: '700' }, reversed: { color: '#667085', textDecorationLine: 'line-through' }, signOut: { color: '#596780', marginTop: 8, textAlign: 'center' }, error: { color: '#b42318', fontSize: 13, lineHeight: 18 }, success: { color: '#027a48', marginTop: 14 } });
