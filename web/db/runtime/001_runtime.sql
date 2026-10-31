-- Executable application schema. Earlier ../*.sql files are design targets, not runtime migrations.
-- No patient names, comments, vitals or password hashes are stored in plaintext columns.
CREATE SCHEMA IF NOT EXISTS anafix;
CREATE TABLE IF NOT EXISTS anafix.identity_record (
  kind text NOT NULL CHECK (kind IN ('organizations','accounts','billingEntries','sessions','devices')),
  id text NOT NULL, organization_id text, login text, payload text NOT NULL,
  PRIMARY KEY (kind,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS identity_login_idx ON anafix.identity_record(lower(login)) WHERE kind='accounts';
CREATE INDEX IF NOT EXISTS identity_org_idx ON anafix.identity_record(kind,organization_id);
CREATE TABLE IF NOT EXISTS anafix.examination (
  id text PRIMARY KEY, organization_id text NOT NULL,
  examined_at timestamptz NOT NULL, row_version integer NOT NULL CHECK (row_version>0),
  deleted_at timestamptz, confirmed boolean NOT NULL, severity smallint NOT NULL CHECK (severity BETWEEN 0 AND 5),
  payload text NOT NULL
);
CREATE INDEX IF NOT EXISTS examination_org_date_idx ON anafix.examination(organization_id,examined_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS examination_offline_cursor_idx ON anafix.examination(organization_id,id);
CREATE TABLE IF NOT EXISTS anafix.offline_receipt (operation_id text PRIMARY KEY, payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS anafix.offline_conflict (
  id text PRIMARY KEY, operation_id text NOT NULL UNIQUE, organization_id text NOT NULL, actor_id text NOT NULL,
  examination_id text NOT NULL, created_at timestamptz NOT NULL, payload text NOT NULL
);
CREATE INDEX IF NOT EXISTS conflict_org_actor_idx ON anafix.offline_conflict(organization_id,actor_id,created_at DESC);
CREATE TABLE IF NOT EXISTS anafix.audit_event (
  id text PRIMARY KEY, category text NOT NULL CHECK (category IN ('security','export')),
  occurred_at timestamptz NOT NULL, organization_id text, actor_id text, event text NOT NULL, metadata jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_category_time_idx ON anafix.audit_event(category,occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_org_time_idx ON anafix.audit_event(organization_id,occurred_at DESC);
