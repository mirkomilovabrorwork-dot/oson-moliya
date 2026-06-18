// Daily cap for COSTLY bot operations (voice/audio/photo — each calls a paid API).
// Generous for a real SMB user (~20-40 voice logs/day), tight enough to cap a runaway bill.
export const COSTLY_DAILY_CAP = 80;

export interface CostlyState {
  ymd: string | null;
  count: number;
}

/**
 * Decide whether one more costly op is allowed today, and return the next state to persist.
 * Resets automatically when `today` differs from the stored day.
 */
export function evalCostlyCap(
  current: CostlyState,
  today: string,
  cap: number = COSTLY_DAILY_CAP
): { allowed: boolean; next: CostlyState } {
  const base = current.ymd === today ? current.count : 0; // reset on new day or null
  if (base >= cap) {
    return { allowed: false, next: { ymd: today, count: base } };
  }
  return { allowed: true, next: { ymd: today, count: base + 1 } };
}
