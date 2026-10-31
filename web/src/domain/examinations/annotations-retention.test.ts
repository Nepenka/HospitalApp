import assert from "node:assert/strict";
import test from "node:test";
import { annotationErrorMessage, normalizeAnnotations, normalizeReactionTimeDraft, PHYSICIAN_COMMENT_MAX_LENGTH, reactionDateLabel, validReactionDate } from "./annotations.ts";
import { DEFAULT_DELETED_RECORD_RETENTION_YEARS, deletionExpiry, eligibleForDeletion, validRetentionYears } from "./retention.ts";

test("empty or legacy annotations stay unknown, not midnight", () => {
  assert.deepEqual(normalizeAnnotations({}), { ok: true, value: { physicianComment: null, reactionDate: null, reactionTime: null } });
  assert.deepEqual(normalizeAnnotations({ reactionDate: "2026-10-01" }), { ok: true, value: { physicianComment: null, reactionDate: "2026-10-01", reactionTime: null } });
  assert.equal(reactionDateLabel("2026-10-01", null, "ru"), "01.10.2026 (время неизвестно)");
  assert.equal(reactionDateLabel("2026-10-01", "00:00", "en"), "01/10/2026, 00:00 (Minsk time)");
});

test("date validation rejects normalization, invalid days and malformed input", () => {
  for (const value of ["2026-02-29", "2026-04-31", "0000-01-01", "2026-13-01", "2026-10-00", "2026-1-01", "not-a-date"]) assert.equal(validReactionDate(value), false, value);
  assert.equal(validReactionDate("2028-02-29"), true);
  assert.equal(normalizeAnnotations({ reactionDate: 123 }).ok, false);
});

test("time is optional but requires a valid known date", () => {
  for (const reactionTime of ["24:00", "12:60", "1:00", "12:00:01"]) assert.deepEqual(normalizeAnnotations({ reactionDate: "2026-10-01", reactionTime }), { ok: false, error: "time" });
  assert.deepEqual(normalizeAnnotations({ reactionTime: "12:00" }), { ok: false, error: "time" });
  assert.equal(normalizeAnnotations({ reactionDate: "2026-10-01", reactionTime: "23:59" }).ok, true);
});

test("keyboard time input preserves incomplete values and formats completed input only", () => {
  for (const value of ["", "0", "09", "09:", "09:3", "2:"]) assert.equal(normalizeReactionTimeDraft(value), value);
  for (const [value, expected] of [["0930", "09:30"], ["930", "09:30"], ["9:30", "09:30"], ["00:00", "00:00"], ["2359", "23:59"]]) {
    const reactionTime = normalizeReactionTimeDraft(value);
    assert.equal(reactionTime, expected);
    assert.equal(normalizeAnnotations({ reactionDate: "2026-10-02", reactionTime }).ok, true);
  }
  for (const value of ["2400", "1260", "09:3", "abcd"]) assert.equal(normalizeAnnotations({ reactionDate: "2026-10-02", reactionTime: normalizeReactionTimeDraft(value) }).ok, false);
  assert.equal(normalizeAnnotations({ reactionTime: normalizeReactionTimeDraft("0930") }).ok, false);
});

test("physician note is separate, preserves paragraphs and accepts bounded text only", () => {
  const result = normalizeAnnotations({ physicianComment: "  Первая строка\nВторая строка  " });
  assert.deepEqual(result, { ok: true, value: { physicianComment: "Первая строка\nВторая строка", reactionDate: null, reactionTime: null } });
  assert.equal(normalizeAnnotations({ physicianComment: "я".repeat(PHYSICIAN_COMMENT_MAX_LENGTH) }).ok, true);
  assert.deepEqual(normalizeAnnotations({ physicianComment: "я".repeat(PHYSICIAN_COMMENT_MAX_LENGTH + 1) }), { ok: false, error: "comment" });
  assert.equal(normalizeAnnotations({ physicianComment: { conclusion: "override" } }).ok, false);
  assert.match(annotationErrorMessage("comment", "en"), /physician comment/);
});

test("retention defaults to five calendar years from deletion", () => {
  assert.equal(DEFAULT_DELETED_RECORD_RETENTION_YEARS, 5);
  assert.equal(deletionExpiry("2026-10-01T12:30:00.000Z"), "2031-10-01T12:30:00.000Z");
  assert.equal(eligibleForDeletion("2026-10-01T12:30:00.000Z", 5, new Date("2031-10-01T12:29:59.999Z")), false);
  assert.equal(eligibleForDeletion("2026-10-01T12:30:00.000Z", 5, new Date("2031-10-01T12:30:00.000Z")), true);
});

test("active, legacy and malformed records never qualify; hospital overrides apply", () => {
  const now = new Date("2032-10-01T12:30:00.000Z");
  for (const deletedAt of [null, undefined, "invalid"]) assert.equal(eligibleForDeletion(deletedAt, 5, now), false);
  assert.equal(eligibleForDeletion("2026-10-01T12:30:00.000Z", 10, now), false);
  assert.equal(eligibleForDeletion("2026-10-01T12:30:00.000Z", 5, now), true);
  for (const value of [0, -1, 101, 5.5, "5", NaN]) assert.equal(validRetentionYears(value), false);
  assert.equal(deletionExpiry("2026-10-01T12:30:00.000Z", 0), null);
  assert.equal(deletionExpiry("2028-02-29T18:15:00.000Z", 5), "2033-02-28T18:15:00.000Z");
  assert.equal(deletionExpiry("2028-02-29T18:15:00.000Z", 4), "2032-02-29T18:15:00.000Z");
});
