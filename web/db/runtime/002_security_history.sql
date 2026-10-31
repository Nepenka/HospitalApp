-- Append-only transactional metadata audit and encrypted clinical revisions.
CREATE TABLE anafix.auth_factor(user_id text PRIMARY KEY,payload text NOT NULL);
CREATE TABLE anafix.rate_limit(key_digest text PRIMARY KEY,attempts integer NOT NULL,reset_at timestamptz NOT NULL);
CREATE INDEX rate_limit_expiry_idx ON anafix.rate_limit(reset_at);
CREATE TABLE anafix.examination_revision(
  examination_id text NOT NULL, organization_id text NOT NULL, row_version integer NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now(), actor_id text NOT NULL, reason text NOT NULL,
  payload text NOT NULL, PRIMARY KEY(examination_id,row_version)
);
INSERT INTO anafix.examination_revision(examination_id,organization_id,row_version,actor_id,reason,payload)
SELECT id,organization_id,row_version,'migration','baseline',payload FROM anafix.examination;
ALTER TABLE anafix.audit_event ADD COLUMN sequence_id bigint GENERATED ALWAYS AS IDENTITY;
ALTER TABLE anafix.audit_event ADD COLUMN previous_hash text;
ALTER TABLE anafix.audit_event ADD COLUMN entry_hash text;
CREATE UNIQUE INDEX audit_sequence_idx ON anafix.audit_event(sequence_id);
CREATE FUNCTION anafix.reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'APPEND_ONLY_HISTORY'; END $$;
CREATE TRIGGER immutable_revision BEFORE UPDATE OR DELETE ON anafix.examination_revision FOR EACH ROW EXECUTE FUNCTION anafix.reject_history_change();
-- Existing events also belong to the chain. The role running migrations owns the tables.
DO $$ DECLARE item record; previous text:='genesis'; digest text; BEGIN
  FOR item IN SELECT * FROM anafix.audit_event ORDER BY sequence_id LOOP
    digest:=encode(sha256(convert_to(previous || jsonb_build_object('id',item.id,'category',item.category,'at',item.occurred_at,'organization',item.organization_id,'actor',item.actor_id,'event',item.event,'metadata',item.metadata)::text,'UTF8')),'hex');
    UPDATE anafix.audit_event SET previous_hash=previous,entry_hash=digest WHERE id=item.id;
    previous:=digest;
  END LOOP;
END $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON anafix.audit_event FOR EACH ROW EXECUTE FUNCTION anafix.reject_history_change();
CREATE FUNCTION anafix.audit_chain() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,anafix AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('anafix:audit-chain',0));
  -- Defaults are evaluated before this lock; allocate chain order inside it.
  NEW.sequence_id:=nextval(pg_get_serial_sequence('anafix.audit_event','sequence_id'));
  SELECT entry_hash INTO NEW.previous_hash FROM anafix.audit_event WHERE entry_hash IS NOT NULL ORDER BY sequence_id DESC LIMIT 1;
  NEW.previous_hash:=coalesce(NEW.previous_hash,'genesis');
  NEW.entry_hash:=encode(sha256(convert_to(NEW.previous_hash || jsonb_build_object('id',NEW.id,'category',NEW.category,'at',NEW.occurred_at,'organization',NEW.organization_id,'actor',NEW.actor_id,'event',NEW.event,'metadata',NEW.metadata)::text,'UTF8')),'hex');
  RETURN NEW;
END $$;
CREATE TRIGGER chain_audit BEFORE INSERT ON anafix.audit_event FOR EACH ROW EXECUTE FUNCTION anafix.audit_chain();
CREATE FUNCTION anafix.business_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,anafix AS $$
DECLARE actor text:=coalesce(nullif(current_setting('anafix.actor_id',true),''),'system'); resource text; tenant text; action text;
BEGIN
  IF TG_TABLE_NAME='examination' THEN
    IF TG_OP='UPDATE' AND NEW.row_version<>OLD.row_version+1 THEN RAISE EXCEPTION 'REVISION_MUST_INCREMENT'; END IF;
    resource:=NEW.id; tenant:=NEW.organization_id;
    IF TG_OP='INSERT' THEN action:='examination.created';
    ELSIF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN action:='examination.deleted';
    ELSE action:='examination.updated'; END IF;
    INSERT INTO anafix.examination_revision(examination_id,organization_id,row_version,actor_id,reason,payload)
      VALUES(NEW.id,NEW.organization_id,NEW.row_version,actor,action,NEW.payload);
  ELSE
    IF TG_OP='DELETE' THEN resource:=OLD.id; tenant:=OLD.organization_id; action:='storage.'||OLD.kind||'.deleted';
    ELSE resource:=NEW.id; tenant:=NEW.organization_id; action:='storage.'||NEW.kind||CASE WHEN TG_OP='INSERT' THEN '.created' ELSE '.updated' END; END IF;
  END IF;
  INSERT INTO anafix.audit_event(id,category,occurred_at,organization_id,actor_id,event,metadata)
    VALUES(gen_random_uuid()::text,'security',clock_timestamp(),tenant,actor,action,jsonb_build_object('timestamp',clock_timestamp(),'event',action,'outcome','success','actorId',actor,'organizationId',tenant,'resourceId',resource,'origin','database-transaction'));
  RETURN NULL;
END $$;
CREATE TRIGGER clinical_history AFTER INSERT OR UPDATE ON anafix.examination FOR EACH ROW EXECUTE FUNCTION anafix.business_history();
CREATE TRIGGER identity_history AFTER INSERT OR UPDATE OR DELETE ON anafix.identity_record FOR EACH ROW EXECUTE FUNCTION anafix.business_history();
REVOKE ALL ON FUNCTION anafix.business_history(),anafix.audit_chain(),anafix.reject_history_change() FROM PUBLIC;
