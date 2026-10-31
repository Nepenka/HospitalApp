export type LicenseCurrency = "USD" | "BYN" | "RUB";
export interface OrganizationLicense {
  startsOn: string | null;
  endsOn: string | null;
  maxClinicians: number | null;
  priceMinor: number | null;
  currency: LicenseCurrency | null;
  offlineAllowed: boolean;
  offlineHours: number | null;
}
export const emptyLicense: OrganizationLicense = { startsOn: null, endsOn: null, maxClinicians: null, priceMinor: null, currency: null, offlineAllowed: false, offlineHours: null };
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function minskToday(now = new Date()): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Minsk", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function licenseState(license: OrganizationLicense, today = minskToday()): "unconfigured" | "scheduled" | "active" | "expired" {
  if (license.startsOn && license.startsOn > today) return "scheduled";
  if (license.endsOn && license.endsOn < today) return "expired";
  return license.startsOn || license.endsOn ? "active" : "unconfigured";
}
export function licenseAllowsClinicalAccess(license: OrganizationLicense): boolean { return !["expired", "scheduled"].includes(licenseState(license)); }
export function validateLicense(value: OrganizationLicense): void {
  if ((value.startsOn && !validDate(value.startsOn)) || (value.endsOn && !validDate(value.endsOn)) || (value.startsOn && value.endsOn && value.startsOn > value.endsOn)) throw new Error("INVALID_LICENSE");
  if (value.maxClinicians !== null && (!Number.isSafeInteger(value.maxClinicians) || value.maxClinicians < 1 || value.maxClinicians > 100000)) throw new Error("INVALID_LICENSE");
  if (value.priceMinor !== null && (!Number.isSafeInteger(value.priceMinor) || value.priceMinor < 0 || value.priceMinor > 99999999999 || !["USD", "BYN", "RUB"].includes(value.currency ?? ""))) throw new Error("INVALID_LICENSE");
  if (value.offlineHours !== null && (!Number.isInteger(value.offlineHours) || value.offlineHours < 1 || value.offlineHours > 168)) throw new Error("INVALID_LICENSE");
  if (value.offlineAllowed && value.offlineHours === null) throw new Error("OFFLINE_DURATION_REQUIRED");
}
