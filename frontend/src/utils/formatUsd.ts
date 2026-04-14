export function formatUsd(cents: number): string {
  const dollars = (cents || 0) / 100;
  if (Number.isInteger(dollars)) {
    return `$${dollars}`;
  }
  return `$${dollars.toFixed(2)}`;
}
