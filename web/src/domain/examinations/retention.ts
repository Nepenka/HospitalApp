export const DEFAULT_DELETED_RECORD_RETENTION_YEARS = 5;

export function validRetentionYears(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100;
}

/** Calendar years from soft deletion, not from examination date. Never remove active records. */
export function deletionExpiry(deletedAt: string | null | undefined, years = DEFAULT_DELETED_RECORD_RETENTION_YEARS): string | null {
  if (!deletedAt || !validRetentionYears(years)) return null;
  const date = new Date(deletedAt);
  if (!Number.isFinite(date.valueOf())) return null;
  const originalMonth = date.getUTCMonth();
  const expiry = new Date(date);
  expiry.setUTCFullYear(date.getUTCFullYear() + years);
  // A February 29 anniversary in a non-leap year is February 28, not March 1.
  if (expiry.getUTCMonth() !== originalMonth) expiry.setUTCDate(0);
  return expiry.toISOString();
}

export function eligibleForDeletion(deletedAt: string | null | undefined, years: number, now: Date): boolean {
  const expiry = deletionExpiry(deletedAt, years);
  return expiry !== null && Number.isFinite(now.valueOf()) && new Date(expiry).valueOf() <= now.valueOf();
}
