import "server-only";
import type { BillingCurrency, BillingEntryRecord } from "@/server/identity/store";

export const billingCurrencies: BillingCurrency[] = ["USD", "BYN", "RUB"];

export interface CurrencyFinancialSummary {
  charged: number;
  received: number;
  debt: number;
  advance: number;
  scheduled: number;
}

export interface BillingChartPoint {
  key: string;
  label: string;
  charged: number;
  received: number;
}

export function summarizeBilling(entries: BillingEntryRecord[], now = new Date()): Record<BillingCurrency, CurrencyFinancialSummary> {
  const today = now.toISOString().slice(0, 10);
  return Object.fromEntries(billingCurrencies.map((currency) => {
    const active = entries.filter((entry) => !entry.voidedAt && entry.currency === currency);
    const charged = active.filter((entry) => entry.type === "charge" && entry.effectiveDate <= today).reduce((sum, entry) => sum + entry.amountMinor, 0);
    const received = active.filter((entry) => entry.type === "payment" && entry.effectiveDate <= today).reduce((sum, entry) => sum + entry.amountMinor, 0);
    const scheduled = active.filter((entry) => entry.type === "charge" && entry.effectiveDate > today).reduce((sum, entry) => sum + entry.amountMinor, 0);
    return [currency, { charged, received, debt: Math.max(charged - received, 0), advance: Math.max(received - charged, 0), scheduled }];
  })) as Record<BillingCurrency, CurrencyFinancialSummary>;
}

export function buildBillingChart(entries: BillingEntryRecord[], currency: BillingCurrency, now = new Date()): BillingChartPoint[] {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return Array.from({ length: 6 }, (_, offset) => {
    const date = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - (5 - offset), 1));
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    const startKey = date.toISOString().slice(0, 10);
    const endKey = next.toISOString().slice(0, 10);
    const period = entries.filter((entry) => !entry.voidedAt && entry.currency === currency && entry.effectiveDate >= startKey && entry.effectiveDate < endKey);
    return {
      key: date.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(date).replace(".", ""),
      charged: period.filter((entry) => entry.type === "charge").reduce((sum, entry) => sum + entry.amountMinor, 0),
      received: period.filter((entry) => entry.type === "payment").reduce((sum, entry) => sum + entry.amountMinor, 0),
    };
  });
}
