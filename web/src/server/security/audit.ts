import "server-only";
type SecurityEvent = "authentication.succeeded" | "authentication.failed" | "authentication.rate_limited" | "session.ended" | "authorization.denied" | "examination.created" | "examination.viewed" | "examination.updated" | "examination.deleted" | "organization.created" | "account.created" | "account.password_reset" | "billing.entry_created" | "billing.entry_voided";
export function auditSecurityEvent(event: SecurityEvent, details: { actorId?: string; outcome: "success" | "failure"; resourceId?: string }): void {
  const record = { timestamp: new Date().toISOString(), event, outcome: details.outcome, actorId: details.actorId ?? "anonymous", resourceId: details.resourceId };
  if (process.env.NODE_ENV !== "test") console.info(JSON.stringify(record));
}
