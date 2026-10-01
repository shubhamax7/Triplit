/**
 * Formats an integer paise value as an INR string with thousands separators.
 *
 * Examples:
 *   50000n  → "₹500.00"
 *   100n    → "₹1.00"
 *   5n      → "₹0.05"
 *   -50000n → "-₹500.00"
 *   1234567n → "₹12,345.67"
 */
export function formatInr(paise: bigint): string {
  const negative = paise < 0n;
  const absolute = negative ? -paise : paise;
  const rupees = Number(absolute / 100n);
  const paiseRemainder = Number(absolute % 100n);

  // Format the rupee part with Indian-locale thousands grouping (e.g. 1,23,456).
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees + paiseRemainder / 100);

  return `${negative ? '-' : ''}₹${formatted}`;
}

export function parseAmountToPaise(input: string): bigint {
  const normalized = input.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Enter an amount with at most two decimal places.');
  const [whole, fraction = ''] = normalized.split('.');
  const paise = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (paise <= 0n) throw new Error('Amount must be greater than zero.');
  return paise;
}
