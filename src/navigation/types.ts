export type RootStackParamList = {
  Dashboard: undefined;
  AddExpense: undefined;
  History: undefined;
  MonthlySummary: undefined;
  Clearance: undefined;
  Members: undefined;
  PairExpenses: undefined;
  PairDetail: { counterpartyId: string; counterpartyName: string };
  AddPairExpense: { counterpartyId?: string };
};
