import assert from "node:assert/strict";
import test from "node:test";
import { paginateExaminations } from "./history-query.ts";
import type { ExaminationSummary } from "./types.ts";

const record = (id: string, examinedAt: string, patientName: string, anaphylaxisConfirmed = false): ExaminationSummary => ({
  id, examinedAt, patientName, anaphylaxisConfirmed,
  probableAllergen: anaphylaxisConfirmed ? "Пенициллин" : null,
  severityGrade: anaphylaxisConfirmed ? 3 : 1,
  diagnosis: "Заключение",
});

const records = [
  record("older", "2026-09-29T20:59:00.000Z", "Иванов Иван"),
  record("second", "2026-09-29T21:01:00.000Z", "Петров Пётр", true),
  record("newer", "2026-09-30T08:00:00.000Z", "Сидоров Сергей", true),
];

test("date range uses Minsk calendar day across UTC midnight", () => {
  const result = paginateExaminations(records, { from: "2026-09-30", to: "2026-09-30" });
  assert.deepEqual(result.items.map((item) => item.id), ["newer", "second"]);
});

test("name, allergen and diagnosis filters apply before pagination", () => {
  assert.deepEqual(paginateExaminations(records, { search: "пет", diagnosis: "anaphylaxis" }).items.map((item) => item.id), ["second"]);
  assert.equal(paginateExaminations(records, { search: "пенициллин", diagnosis: "other" }).total, 0);
});

test("server page is bounded and stable", () => {
  const first = paginateExaminations(records, { page: 1, pageSize: 1 });
  const last = paginateExaminations(records, { page: 99, pageSize: 1 });
  assert.equal(first.total, 3);
  assert.equal(first.totalPages, 3);
  assert.deepEqual(first.items.map((item) => item.id), ["newer"]);
  assert.equal(last.page, 3);
  assert.deepEqual(last.items.map((item) => item.id), ["older"]);
});
