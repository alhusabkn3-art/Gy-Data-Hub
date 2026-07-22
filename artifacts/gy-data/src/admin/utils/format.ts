/**
 * Smart Nigerian Naira formatter.
 *
 * Automatically picks the right unit so numbers are always readable:
 *   ₦0 – ₦9,999        → ₦2,300          (exact, comma-separated)
 *   ₦10,000 – ₦999,999 → ₦23.5K          (one decimal, K suffix)
 *   ₦1,000,000 +        → ₦1.23M          (two decimals, M suffix)
 */
export function fmtNaira(amount: number): string {
  if (amount >= 1_000_000) {
    const val = amount / 1_000_000;
    return `₦${val % 1 === 0 ? val.toFixed(0) : val.toFixed(2)}M`;
  }
  if (amount >= 10_000) {
    const val = amount / 1_000;
    return `₦${val % 1 === 0 ? val.toFixed(0) : val.toFixed(1)}K`;
  }
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Sub-label version: always shows full precision for tooltip/description use */
export function fmtNairaFull(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
