export function formatInr(paise: bigint): string {
  const negative = paise < 0n;
  const absolute = negative ? -paise : paise;
  const rupees = absolute / 100n;
  const cents = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}₹${rupees.toString()}.${cents}`;
}

export function parseAmountToPaise(input: string): bigint {
  const normalized = input.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Enter an amount with at most two decimal places.');
  const [whole, fraction = ''] = normalized.split('.');
  const paise = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (paise <= 0n) throw new Error('Amount must be greater than zero.');
  return paise;
}
