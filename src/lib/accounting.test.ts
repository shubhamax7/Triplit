import { describe, expect, it } from 'vitest';
import {
  calculateBalances,
  calculateBilateralBalance,
  calculateBilateralLedger,
  calculateShares,
  generateTransfers,
  assertZeroSum,
  type BilateralEntry,
} from './accounting';

const members = ['member-a', 'member-b', 'member-c'] as const;
type Member = (typeof members)[number];

describe('calculateShares (Phase 8)', () => {
  it('allocates 0 paise to all members when total is 0', () => {
    const shares = calculateShares(0n, members);
    expect(shares.get('member-a')).toBe(0n);
    expect(shares.get('member-b')).toBe(0n);
    expect(shares.get('member-c')).toBe(0n);
  });

  it('allocates remainder of 1 paise to member 0 (stable order)', () => {
    const shares = calculateShares(1n, members);
    expect([...shares.values()]).toEqual([1n, 0n, 0n]);
    expect([...shares.values()].reduce((s, v) => s + v, 0n)).toBe(1n);
  });

  it('allocates remainder of 2 paise to members 0 and 1', () => {
    const shares = calculateShares(2n, members);
    expect([...shares.values()]).toEqual([1n, 1n, 0n]);
    expect([...shares.values()].reduce((s, v) => s + v, 0n)).toBe(2n);
  });

  it('allocates exact multiple of 3 equally (remainder = 0)', () => {
    const shares = calculateShares(3n, members);
    expect([...shares.values()]).toEqual([1n, 1n, 1n]);
    expect([...shares.values()].reduce((s, v) => s + v, 0n)).toBe(3n);
  });

  it('allocates 4 paise: base 1 + remainder 1 to member 0', () => {
    const shares = calculateShares(4n, members);
    expect([...shares.values()]).toEqual([2n, 1n, 1n]);
    expect([...shares.values()].reduce((s, v) => s + v, 0n)).toBe(4n);
  });

  it('allocates 5 paise: base 1 + remainder 2 to members 0 and 1', () => {
    const shares = calculateShares(5n, members);
    expect([...shares.values()]).toEqual([2n, 2n, 1n]);
    expect([...shares.values()].reduce((s, v) => s + v, 0n)).toBe(5n);
  });

  it('allocates 100 paise (₹1): 34, 33, 33', () => {
    const shares = calculateShares(100n, members);
    expect([...shares.values()]).toEqual([34n, 33n, 33n]);
    expect([...shares.values()].reduce((s, v) => s + v, 0n)).toBe(100n);
  });

  it('allocates 10000000001 paise correctly (large BigInt)', () => {
    const shares = calculateShares(10000000001n, members);
    expect([...shares.values()].reduce((s, v) => s + v, 0n)).toBe(10000000001n);
  });

  it('throws when totalPaise is negative', () => {
    expect(() => calculateShares(-1n, members)).toThrow('Total cannot be negative');
  });

  it('throws when members count is not 3', () => {
    expect(() => calculateShares(100n, ['a', 'b'])).toThrow('Triplit requires exactly three members');
    expect(() => calculateShares(100n, ['a', 'b', 'c', 'd'])).toThrow('Triplit requires exactly three members');
  });

  it('throws when member IDs are not unique', () => {
    expect(() => calculateShares(100n, ['a', 'a', 'b'])).toThrow('Member IDs must be unique');
  });
});

describe('calculateBalances (Phase 8 & 9)', () => {
  it('handles member A paying the entire amount', () => {
    const balances = calculateBalances(members, [{ memberId: 'member-a', amountPaise: 90000n }]);
    expect(balances.find((b) => b.memberId === 'member-a')?.netPaise).toBe(60000n);
    expect(balances.find((b) => b.memberId === 'member-b')?.netPaise).toBe(-30000n);
    expect(balances.find((b) => b.memberId === 'member-c')?.netPaise).toBe(-30000n);
    assertZeroSum(balances.map((b) => b.netPaise));
  });

  it('handles member B paying the entire amount', () => {
    const balances = calculateBalances(members, [{ memberId: 'member-b', amountPaise: 90000n }]);
    expect(balances.find((b) => b.memberId === 'member-a')?.netPaise).toBe(-30000n);
    expect(balances.find((b) => b.memberId === 'member-b')?.netPaise).toBe(60000n);
    expect(balances.find((b) => b.memberId === 'member-c')?.netPaise).toBe(-30000n);
    assertZeroSum(balances.map((b) => b.netPaise));
  });

  it('handles member C paying the entire amount with remainder paise', () => {
    // Total 100 paise. Shares: A: 34, B: 33, C: 33. C paid 100.
    // Net: A = -34, B = -33, C = 100 - 33 = +67. Sum = -34 - 33 + 67 = 0.
    const balances = calculateBalances(members, [{ memberId: 'member-c', amountPaise: 100n }]);
    expect(balances.find((b) => b.memberId === 'member-a')?.netPaise).toBe(-34n);
    expect(balances.find((b) => b.memberId === 'member-b')?.netPaise).toBe(-33n);
    expect(balances.find((b) => b.memberId === 'member-c')?.netPaise).toBe(67n);
    assertZeroSum(balances.map((b) => b.netPaise));
  });

  it('handles all three members paying exactly equal shares', () => {
    const balances = calculateBalances(members, [
      { memberId: 'member-a', amountPaise: 30000n },
      { memberId: 'member-b', amountPaise: 30000n },
      { memberId: 'member-c', amountPaise: 30000n },
    ]);
    expect(balances.every((b) => b.netPaise === 0n)).toBe(true);
    assertZeroSum(balances.map((b) => b.netPaise));
  });

  it('correctly handles append-only reversals and adjustments', () => {
    // Member A paid 5000 paise originally. Then reversed -5000, then adjusted 2000.
    const balances = calculateBalances(members, [
      { memberId: 'member-a', amountPaise: 5000n },
      { memberId: 'member-a', amountPaise: -5000n },
      { memberId: 'member-a', amountPaise: 2000n },
    ]);
    // Total should be 2000 paise.
    expect(balances.find((b) => b.memberId === 'member-a')?.contributionPaise).toBe(2000n);
    assertZeroSum(balances.map((b) => b.netPaise));
  });

  it('throws when contribution has an unknown member ID', () => {
    expect(() =>
      calculateBalances(members, [{ memberId: 'stranger', amountPaise: 5000n }]),
    ).toThrow('Contribution belongs to an unknown member');
  });
});

describe('generateTransfers (Phase 9)', () => {
  it('returns empty transfers array when everyone is settled', () => {
    const balances = [
      { memberId: 'member-a', netPaise: 0n },
      { memberId: 'member-b', netPaise: 0n },
      { memberId: 'member-c', netPaise: 0n },
    ];
    expect(generateTransfers(balances)).toEqual([]);
  });

  it('generates 2 transfers for 1 creditor and 2 debtors', () => {
    // A: +60000, B: -30000, C: -30000
    const balances = [
      { memberId: 'member-a', netPaise: 60000n },
      { memberId: 'member-b', netPaise: -30000n },
      { memberId: 'member-c', netPaise: -30000n },
    ];
    const transfers = generateTransfers(balances);
    expect(transfers).toHaveLength(2);
    expect(transfers).toContainEqual({ fromMemberId: 'member-b', toMemberId: 'member-a', amountPaise: 30000n });
    expect(transfers).toContainEqual({ fromMemberId: 'member-c', toMemberId: 'member-a', amountPaise: 30000n });
  });

  it('generates 2 transfers for 2 creditors and 1 debtor', () => {
    // A: +30000, B: +30000, C: -60000
    const balances = [
      { memberId: 'member-a', netPaise: 30000n },
      { memberId: 'member-b', netPaise: 30000n },
      { memberId: 'member-c', netPaise: -60000n },
    ];
    const transfers = generateTransfers(balances);
    expect(transfers).toHaveLength(2);
    const totalPaid = transfers.reduce((sum, t) => sum + t.amountPaise, 0n);
    expect(totalPaid).toBe(60000n);
    expect(transfers.every((t) => t.fromMemberId === 'member-c')).toBe(true);
  });

  it('generates exactly 1 transfer when one member has 0 balance', () => {
    // A: +30000, B: 0, C: -30000
    const balances = [
      { memberId: 'member-a', netPaise: 30000n },
      { memberId: 'member-b', netPaise: 0n },
      { memberId: 'member-c', netPaise: -30000n },
    ];
    const transfers = generateTransfers(balances);
    expect(transfers).toEqual([{ fromMemberId: 'member-c', toMemberId: 'member-a', amountPaise: 30000n }]);
  });

  it('never exceeds 2 transfers for any 3-member scenario (N=3 bound)', () => {
    const balances = [
      { memberId: 'member-a', netPaise: 15000n },
      { memberId: 'member-b', netPaise: -10000n },
      { memberId: 'member-c', netPaise: -5000n },
    ];
    const transfers = generateTransfers(balances);
    expect(transfers.length).toBeLessThanOrEqual(2);
  });
});

describe('Property & Invariant Testing (Phases 20 & 27)', () => {
  it('asserts sum(balances) === 0n across 100 random expense vectors', () => {
    for (let i = 0; i < 100; i++) {
      const expenses = [
        { memberId: 'member-a', amountPaise: BigInt(Math.floor(Math.random() * 500000)) },
        { memberId: 'member-b', amountPaise: BigInt(Math.floor(Math.random() * 500000)) },
        { memberId: 'member-c', amountPaise: BigInt(Math.floor(Math.random() * 500000)) },
      ];
      const balances = calculateBalances(members, expenses);
      const totalNet = balances.reduce((sum, b) => sum + b.netPaise, 0n);
      expect(totalNet).toBe(0n);

      const transfers = generateTransfers(balances);
      expect(transfers.length).toBeLessThanOrEqual(2);
      const creditorSum = balances.filter((b) => b.netPaise > 0n).reduce((s, b) => s + b.netPaise, 0n);
      const transferSum = transfers.reduce((s, t) => s + t.amountPaise, 0n);
      expect(transferSum).toBe(creditorSum);
    }
  });

  it('asserts net(A, B) + net(B, A) === 0 across 100 random bilateral transaction sets', () => {
    for (let i = 0; i < 100; i++) {
      const count = Math.floor(Math.random() * 10) + 1;
      const entries: BilateralEntry[] = [];
      for (let j = 0; j < count; j++) {
        const isAtoB = Math.random() > 0.5;
        const types: BilateralEntry['entryType'][] = ['BILATERAL_EXPENSE', 'BILATERAL_REVERSAL', 'BILATERAL_ADJUSTMENT'];
        entries.push({
          payerMemberId: isAtoB ? 'member-a' : 'member-b',
          counterpartyMemberId: isAtoB ? 'member-b' : 'member-a',
          amountPaise: BigInt(Math.floor(Math.random() * 100000) + 1),
          entryType: types[Math.floor(Math.random() * types.length)],
        });
      }
      const netAB = calculateBilateralLedger('member-a', 'member-b', entries);
      const netBA = calculateBilateralLedger('member-b', 'member-a', entries);
      expect(netAB + netBA).toBe(0n);
    }
  });
});

describe('Bilateral Subsystem: 10 Authoritative Scenarios (Phases 25 & 27)', () => {
  it('Scenario 1: Simple single expense A->B: B owes A', () => {
    const entries: BilateralEntry[] = [
      { payerMemberId: 'member-a', counterpartyMemberId: 'member-b', amountPaise: 50000n, entryType: 'BILATERAL_EXPENSE' },
    ];
    expect(calculateBilateralLedger('member-a', 'member-b', entries)).toBe(50000n);
    expect(calculateBilateralLedger('member-b', 'member-a', entries)).toBe(-50000n);
  });

  it('Scenario 2: Mutual payments A->B ₹500 and B->A ₹200: net B owes A ₹300', () => {
    const entries: BilateralEntry[] = [
      { payerMemberId: 'member-a', counterpartyMemberId: 'member-b', amountPaise: 50000n, entryType: 'BILATERAL_EXPENSE' },
      { payerMemberId: 'member-b', counterpartyMemberId: 'member-a', amountPaise: 20000n, entryType: 'BILATERAL_EXPENSE' },
    ];
    expect(calculateBilateralLedger('member-a', 'member-b', entries)).toBe(30000n);
  });

  it('Scenario 3: Exact offset A->B ₹500 and B->A ₹500: net is 0', () => {
    const entries: BilateralEntry[] = [
      { payerMemberId: 'member-a', counterpartyMemberId: 'member-b', amountPaise: 50000n, entryType: 'BILATERAL_EXPENSE' },
      { payerMemberId: 'member-b', counterpartyMemberId: 'member-a', amountPaise: 50000n, entryType: 'BILATERAL_EXPENSE' },
    ];
    expect(calculateBilateralLedger('member-a', 'member-b', entries)).toBe(0n);
  });

  it('Scenario 4: Multiple transactions accumulating', () => {
    const entries: BilateralEntry[] = [
      { payerMemberId: 'member-a', counterpartyMemberId: 'member-b', amountPaise: 10000n, entryType: 'BILATERAL_EXPENSE' },
      { payerMemberId: 'member-a', counterpartyMemberId: 'member-b', amountPaise: 25000n, entryType: 'BILATERAL_EXPENSE' },
      { payerMemberId: 'member-b', counterpartyMemberId: 'member-a', amountPaise: 5000n, entryType: 'BILATERAL_EXPENSE' },
    ];
    expect(calculateBilateralLedger('member-a', 'member-b', entries)).toBe(30000n);
  });

  it('Scenario 5: Reversal cancels expense cleanly', () => {
    const entries: BilateralEntry[] = [
      { payerMemberId: 'member-a', counterpartyMemberId: 'member-b', amountPaise: 50000n, entryType: 'BILATERAL_EXPENSE' },
      { payerMemberId: 'member-a', counterpartyMemberId: 'member-b', amountPaise: 50000n, entryType: 'BILATERAL_REVERSAL' },
    ];
    expect(calculateBilateralLedger('member-a', 'member-b', entries)).toBe(0n);
  });

  it('Scenario 6: Correction upward (Original ₹500, Reversal ₹500, Adjustment ₹600)', () => {
    const entries: BilateralEntry[] = [
      { payerMemberId: 'member-a', counterpartyMemberId: 'member-b', amountPaise: 50000n, entryType: 'BILATERAL_EXPENSE' },
      { payerMemberId: 'member-a', counterpartyMemberId: 'member-b', amountPaise: 50000n, entryType: 'BILATERAL_REVERSAL' },
      { payerMemberId: 'member-a', counterpartyMemberId: 'member-b', amountPaise: 60000n, entryType: 'BILATERAL_ADJUSTMENT' },
    ];
    expect(calculateBilateralLedger('member-a', 'member-b', entries)).toBe(60000n);
  });

  it('Scenario 7: Correction downward (Original ₹1000, Reversal ₹1000, Adjustment ₹200)', () => {
    const entries: BilateralEntry[] = [
      { payerMemberId: 'member-a', counterpartyMemberId: 'member-b', amountPaise: 100000n, entryType: 'BILATERAL_EXPENSE' },
      { payerMemberId: 'member-a', counterpartyMemberId: 'member-b', amountPaise: 100000n, entryType: 'BILATERAL_REVERSAL' },
      { payerMemberId: 'member-a', counterpartyMemberId: 'member-b', amountPaise: 20000n, entryType: 'BILATERAL_ADJUSTMENT' },
    ];
    expect(calculateBilateralLedger('member-a', 'member-b', entries)).toBe(20000n);
  });

  it('Scenario 8: Bilateral isolation (entries for A<->C do not affect A<->B)', () => {
    const entriesAB: BilateralEntry[] = [
      { payerMemberId: 'member-a', counterpartyMemberId: 'member-b', amountPaise: 40000n, entryType: 'BILATERAL_EXPENSE' },
    ];
    const entriesAC: BilateralEntry[] = [
      { payerMemberId: 'member-a', counterpartyMemberId: 'member-c', amountPaise: 90000n, entryType: 'BILATERAL_EXPENSE' },
    ];
    expect(calculateBilateralLedger('member-a', 'member-b', entriesAB)).toBe(40000n);
    expect(calculateBilateralLedger('member-a', 'member-c', entriesAC)).toBe(90000n);
  });

  it('Scenario 9: Exact antisymmetry holds', () => {
    const entries: BilateralEntry[] = [
      { payerMemberId: 'member-a', counterpartyMemberId: 'member-b', amountPaise: 12345n, entryType: 'BILATERAL_EXPENSE' },
    ];
    const netA = calculateBilateralLedger('member-a', 'member-b', entries);
    const netB = calculateBilateralLedger('member-b', 'member-a', entries);
    expect(netA).toBe(-netB);
  });

  it('Scenario 10: Empty transactions list yields zero balance', () => {
    expect(calculateBilateralLedger('member-a', 'member-b', [])).toBe(0n);
  });
});
