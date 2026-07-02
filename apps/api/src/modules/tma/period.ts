// Pure date math for period comparison. Dates are YYYY-MM-DD strings, UTC arithmetic.
const DAY = 86_400_000;

function shift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/** The adjacent window of equal inclusive length, ending the day before `from`. */
export function previousWindow(from: string, to: string): { from: string; to: string } {
  const lenMinus1 = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY;
  const prevTo = shift(from, -1);
  return { from: shift(prevTo, -lenMinus1), to: prevTo };
}

/** Number of calendar days in [from, to], inclusive on both ends. */
export function inclusiveDays(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
}
