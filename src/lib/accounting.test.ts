import { describe, expect, it } from 'vitest';
import { calculateBalances, calculateBilateralBalance, calculateShares, generateTransfers } from './accounting';

const members = ['a', 'b', 'c'] as const;

describe('group accounting', () => {
  it.each([
    [0n, [0n, 0n, 0n]],
    [1n, [1n, 0n, 0n]],
    [2n, [1n, 1n, 0n]],
    [3n, [1n, 1n, 1n]],
    [4n, [2n, 1n, 1n]],
  ])('allocates %s paise deterministically', (total, expected) => {
    expect([...calculateShares(total, members).values()]).toEqual(expected);
  });

  it('produces a zero-sum balance vector and the minimum transfers', () => {
    const balances = calculateBalances(members, [
      { memberId: 'a', amountPaise: 90000n },
      { memberId: 'b', amountPaise: 60000n },
      { memberId: 'c', amountPaise: 30000n },
    ]);
    expect(balances.map((balance) => balance.netPaise)).toEqual([30000n, 0n, -30000n]);
    expect(generateTransfers(balances)).toEqual([{ fromMemberId: 'c', toMemberId: 'a', amountPaise: 30000n }]);
  });
});

describe('bilateral accounting', () => {
  it('is symmetric and independent from group arithmetic', () => {
    const net = calculateBilateralBalance('a', 'b', [
      { payerMemberId: 'a', counterpartyMemberId: 'b', signedAmountPaise: 50000n },
      { payerMemberId: 'b', counterpartyMemberId: 'a', signedAmountPaise: 20000n },
    ]);
    expect(net).toBe(30000n);
    expect(calculateBilateralBalance('b', 'a', [
      { payerMemberId: 'a', counterpartyMemberId: 'b', signedAmountPaise: 50000n },
      { payerMemberId: 'b', counterpartyMemberId: 'a', signedAmountPaise: 20000n },
    ])).toBe(-30000n);
  });
});
