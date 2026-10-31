-- Synchronization outcomes and factor enrollment are business mutations too.
CREATE FUNCTION anafix.additional_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,anafix AS $$
DECLARE actor text:=coalesce(nullif(current_setting('anafix.actor_id',true),''),'system'); resource text; tenant text; action text;
BEGIN
  IF TG_TABLE_NAME='auth_factor' THEN
    resource:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
    SELECT organization_id INTO tenant FROM anafix.identity_record WHERE kind='accounts' AND id=resource;
  ELSIF TG_TABLE_NAME='offline_conflict' THEN
    resource:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
    tenant:=CASE WHEN TG_OP='DELETE' THEN OLD.organization_id ELSE NEW.organization_id END;
  ELSE
    resource:=CASE WHEN TG_OP='DELETE' THEN OLD.operation_id ELSE NEW.operation_id END;
    tenant:=CASE WHEN TG_OP='DELETE' THEN OLD.payload->>'organizationId' ELSE NEW.payload->>'organizationId' END;
  END IF;
  action:='storage.'||TG_TABLE_NAME||'.'||lower(TG_OP);
  INSERT INTO anafix.audit_event(id,category,occurred_at,organization_id,actor_id,event,metadata)
  VALUES(gen_random_uuid()::text,'security',clock_timestamp(),tenant,actor,action,jsonb_build_object('timestamp',clock_timestamp(),'event',action,'actorId',actor,'organizationId',tenant,'resourceId',resource,'outcome','success','origin','database-transaction'));
  RETURN NULL;
END $$;
CREATE TRIGGER factor_history AFTER INSERT OR UPDATE OR DELETE ON anafix.auth_factor FOR EACH ROW EXECUTE FUNCTION anafix.additional_history();
CREATE TRIGGER conflict_history AFTER INSERT OR UPDATE OR DELETE ON anafix.offline_conflict FOR EACH ROW EXECUTE FUNCTION anafix.additional_history();
CREATE TRIGGER receipt_history AFTER INSERT OR UPDATE OR DELETE ON anafix.offline_receipt FOR EACH ROW EXECUTE FUNCTION anafix.additional_history();
REVOKE ALL ON FUNCTION anafix.additional_history() FROM PUBLIC;
