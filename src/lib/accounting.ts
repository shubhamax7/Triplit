export type MemberId = string;

export interface Contribution {
  memberId: MemberId;
  amountPaise: bigint;
}

export interface Balance {
  memberId: MemberId;
  contributionPaise: bigint;
  sharePaise: bigint;
  netPaise: bigint;
}

export interface Transfer {
  fromMemberId: MemberId;
  toMemberId: MemberId;
  amountPaise: bigint;
}

/**
 * Allocates an integer total across the fixed three-member group.  The input
 * order is part of the accounting contract: the first members receive any
 * remainder paise, making the calculation deterministic and auditable.
 */
export function calculateShares(totalPaise: bigint, memberIds: readonly MemberId[]): Map<MemberId, bigint> {
  if (totalPaise < 0n) throw new Error('Total cannot be negative.');
  if (memberIds.length !== 3) throw new Error('Triplit requires exactly three members.');
  if (new Set(memberIds).size !== 3) throw new Error('Member IDs must be unique.');

  const baseShare = totalPaise / 3n;
  const remainder = Number(totalPaise % 3n);
  return new Map(memberIds.map((memberId, index) => [memberId, baseShare + (index < remainder ? 1n : 0n)]));
}

export function calculateBalances(
  memberIds: readonly MemberId[],
  contributions: readonly Contribution[],
): Balance[] {
  const contributionByMember = new Map(memberIds.map((memberId) => [memberId, 0n]));
  for (const contribution of contributions) {
    if (!contributionByMember.has(contribution.memberId)) throw new Error('Contribution belongs to an unknown member.');
    contributionByMember.set(
      contribution.memberId,
      contributionByMember.get(contribution.memberId)! + contribution.amountPaise,
    );
  }

  const totalPaise = [...contributionByMember.values()].reduce((sum, amount) => sum + amount, 0n);
  const shares = calculateShares(totalPaise, memberIds);
  const balances = memberIds.map((memberId) => {
    const contributionPaise = contributionByMember.get(memberId)!;
    const sharePaise = shares.get(memberId)!;
    return { memberId, contributionPaise, sharePaise, netPaise: contributionPaise - sharePaise };
  });

  assertZeroSum(balances.map((balance) => balance.netPaise));
  return balances;
}

/** Greedily settles a zero-sum three-member balance vector in at most two transfers. */
export function generateTransfers(balances: readonly Pick<Balance, 'memberId' | 'netPaise'>[]): Transfer[] {
  if (balances.length !== 3) throw new Error('Triplit settlement requires exactly three balances.');
  assertZeroSum(balances.map((balance) => balance.netPaise));

  const creditors = balances
    .filter((balance) => balance.netPaise > 0n)
    .map((balance) => ({ memberId: balance.memberId, remaining: balance.netPaise }))
    .sort((a, b) => (a.remaining === b.remaining ? a.memberId.localeCompare(b.memberId) : a.remaining > b.remaining ? -1 : 1));
  const debtors = balances
    .filter((balance) => balance.netPaise < 0n)
    .map((balance) => ({ memberId: balance.memberId, remaining: -balance.netPaise }))
    .sort((a, b) => (a.remaining === b.remaining ? a.memberId.localeCompare(b.memberId) : a.remaining > b.remaining ? -1 : 1));

  const transfers: Transfer[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amountPaise = creditor.remaining < debtor.remaining ? creditor.remaining : debtor.remaining;
    if (amountPaise <= 0n || creditor.memberId === debtor.memberId) throw new Error('Invalid settlement state.');
    transfers.push({ fromMemberId: debtor.memberId, toMemberId: creditor.memberId, amountPaise });
    creditor.remaining -= amountPaise;
    debtor.remaining -= amountPaise;
    if (creditor.remaining === 0n) creditorIndex += 1;
    if (debtor.remaining === 0n) debtorIndex += 1;
  }

  const expected = debtors.reduce((sum, debtor) => sum + debtor.remaining, 0n);
  if (expected !== 0n || transfers.length > 2) throw new Error('Settlement invariant violated.');
  return transfers;
}

/** Positive means `memberA` should receive money from `memberB`. */
export function calculateBilateralBalance(
  memberA: MemberId,
  memberB: MemberId,
  entries: readonly { payerMemberId: MemberId; counterpartyMemberId: MemberId; signedAmountPaise: bigint }[],
): bigint {
  if (memberA === memberB) throw new Error('A bilateral pair must contain two different members.');
  const result = entries.reduce((net, entry) => {
    if (entry.payerMemberId === memberA && entry.counterpartyMemberId === memberB) return net + entry.signedAmountPaise;
    if (entry.payerMemberId === memberB && entry.counterpartyMemberId === memberA) return net - entry.signedAmountPaise;
    throw new Error('An entry does not belong to the requested pair.');
  }, 0n);
  if (result + -result !== 0n) throw new Error('Bilateral symmetry invariant violated.');
  return result;
}

export function assertZeroSum(values: readonly bigint[]): void {
  if (values.reduce((sum, value) => sum + value, 0n) !== 0n) throw new Error('Balance vector is not zero-sum.');
}
