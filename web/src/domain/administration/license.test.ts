import test from "node:test";
import assert from "node:assert/strict";
import { emptyLicense, licenseState, validateLicense, validDate, minskToday } from "./license.ts";
test("license defaults are explicit and preserve legacy access without guessing paid terms", () => {
  assert.equal(licenseState(emptyLicense, "2026-10-03"), "unconfigured");
  assert.equal(emptyLicense.offlineAllowed, false);
  assert.equal(emptyLicense.maxClinicians, null);
});
test("license dates are inclusive and use Minsk calendar dates", () => {
  assert.equal(minskToday(new Date("2026-10-02T21:30:00Z")), "2026-10-03");
  assert.equal(licenseState({ ...emptyLicense, endsOn: "2026-10-03" }, "2026-10-03"), "active");
  assert.equal(licenseState({ ...emptyLicense, endsOn: "2026-10-02" }, "2026-10-03"), "expired");
  assert.equal(licenseState({ ...emptyLicense, startsOn: "2026-10-04" }, "2026-10-03"), "scheduled");
});
test("invalid dates, limits and unsupported currencies are rejected", () => {
  assert.equal(validDate("2026-02-29"), false);
  assert.throws(() => validateLicense({ ...emptyLicense, startsOn: "2026-10-04", endsOn: "2026-10-03" }));
  assert.throws(() => validateLicense({ ...emptyLicense, maxClinicians: 0 }));
  assert.throws(() => validateLicense({ ...emptyLicense, priceMinor: 100, currency: null }));
  validateLicense({ ...emptyLicense, priceMinor: 0, currency: "BYN", maxClinicians: 1 });
});
test("offline permission requires an explicit bounded duration", () => {
  assert.throws(() => validateLicense({ ...emptyLicense, offlineAllowed: true }));
  assert.throws(() => validateLicense({ ...emptyLicense, offlineAllowed: true, offlineHours: 169 }));
  validateLicense({ ...emptyLicense, offlineAllowed: true, offlineHours: 1 });
});
