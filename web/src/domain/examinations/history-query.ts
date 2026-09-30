import type { ExaminationSummary } from "./types.ts";

export interface ExaminationHistoryQuery {
  search?: string;
  diagnosis?: "all" | "anaphylaxis" | "other";
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface ExaminationHistoryPage {
  items: ExaminationSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function minskDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Minsk", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function paginateExaminations(examinations: ExaminationSummary[], query: ExaminationHistoryQuery): ExaminationHistoryPage {
  const search = (query.search ?? "").trim().toLocaleLowerCase("ru-RU");
  const pageSize = typeof query.pageSize === "number" && Number.isFinite(query.pageSize) ? Math.min(100, Math.max(1, Math.trunc(query.pageSize))) : 20;
  const diagnosis = query.diagnosis ?? "all";
  const matches = examinations.filter((record) => {
    if (search && !`${record.patientName} ${record.probableAllergen ?? ""}`.toLocaleLowerCase("ru-RU").includes(search)) return false;
    if (diagnosis === "anaphylaxis" && !record.anaphylaxisConfirmed) return false;
    if (diagnosis === "other" && record.anaphylaxisConfirmed) return false;
    if (query.from || query.to) {
      const date = minskDate(record.examinedAt);
      if (query.from && date < query.from) return false;
      if (query.to && date > query.to) return false;
    }
    return true;
  });
  matches.sort((left, right) => right.examinedAt.localeCompare(left.examinedAt) || right.id.localeCompare(left.id));
  const total = matches.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = typeof query.page === "number" && Number.isSafeInteger(query.page) ? query.page : 1;
  const page = Math.min(totalPages, Math.max(1, requestedPage));
  return { items: matches.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, totalPages };
}
