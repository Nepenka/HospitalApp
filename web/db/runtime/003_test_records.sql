ALTER TABLE anafix.examination ADD COLUMN is_test boolean NOT NULL DEFAULT false;
CREATE INDEX examination_test_idx ON anafix.examination(organization_id,id) WHERE is_test AND deleted_at IS NULL;
