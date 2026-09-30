import "server-only";
import { listBillingEntries, listOrganizations, type BillingCurrency } from "@/server/identity/store";
import { billingCurrencies, buildBillingChart, summarizeBilling, type BillingChartPoint, type CurrencyFinancialSummary } from "./billing";

export interface OrganizationAdminRow {
  id: string;
  name: string;
  code: string;
  ownerAccountId: string | null;
  ownerLogin: string;
  users: number;
  activeUsers: number;
  status: "active" | "suspended";
  createdAt: string;
  lastActivityAt: string | null;
  finances: Record<BillingCurrency, CurrencyFinancialSummary>;
}

export interface AdminDashboardData {
  organizations: OrganizationAdminRow[];
  metrics: { organizations: number; users: number; activeUsers: number; newOrganizationsThisMonth: number };
  organizationGrowth: Array<{ key: string; label: string; count: number }>;
  finances: { totals: Record<BillingCurrency, CurrencyFinancialSummary>; charts: Record<BillingCurrency, BillingChartPoint[]> };
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const [organizationRecords, billingEntries] = await Promise.all([listOrganizations(), listBillingEntries()]);
  const organizations = organizationRecords.map((organization) => ({ ...organization, finances: summarizeBilling(billingEntries.filter((entry) => entry.organizationId === organization.id)) }));
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const organizationGrowth = Array.from({ length: 6 }, (_, offset) => {
    const date = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - (5 - offset), 1));
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    return {
      key: date.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(date).replace(".", ""),
      count: organizations.filter((item) => { const created = new Date(item.createdAt); return created >= date && created < next; }).length,
    };
  });
  return {
    organizations,
    organizationGrowth,
    finances: {
      totals: summarizeBilling(billingEntries),
      charts: Object.fromEntries(billingCurrencies.map((currency) => [currency, buildBillingChart(billingEntries, currency)])) as Record<BillingCurrency, BillingChartPoint[]>,
    },
    metrics: {
      organizations: organizations.length,
      users: organizations.reduce((sum, item) => sum + item.users, 0),
      activeUsers: organizations.reduce((sum, item) => sum + item.activeUsers, 0),
      newOrganizationsThisMonth: organizations.filter((item) => new Date(item.createdAt) >= monthStart).length,
    },
  };
}
