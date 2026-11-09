-- Mark history entries that can't be restored: everything removed when an athlete is
-- deleted along with their account. The app sets app.unrecoverable for that one
-- transaction, and the trigger copies it onto every entry it writes, so the athlete's
-- deletion and each score removed with it are flagged together.
--
-- Adding a column is a schema change, not an UPDATE, so the append-only trigger allows it.
ALTER TABLE "audit"."change_log" ADD COLUMN "unrecoverable" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, app, pg_catalog
AS $$
DECLARE
  v_old        jsonb;
  v_new        jsonb;
  v_record_id  uuid;
  v_operation  text := TG_OP;
  v_restore_of bigint := audit.setting('app.restore_of')::bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old := to_jsonb(OLD);
  END IF;

  IF TG_OP <> 'DELETE' THEN
    v_new := to_jsonb(NEW);
  END IF;

  v_record_id := COALESCE((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);

  -- An update made while app.restore_of is set is reapplying an earlier
  -- version. Label it so the history reads honestly instead of looking like
  -- somebody re-typed the old number by hand.
  IF v_restore_of IS NOT NULL AND TG_OP IN ('UPDATE', 'INSERT') THEN
    v_operation := 'RESTORE';
  END IF;

  -- Skip updates that changed nothing but the updated_at stamp.
  IF TG_OP = 'UPDATE' AND (v_old - 'updated_at') = (v_new - 'updated_at') THEN
    RETURN NULL;
  END IF;

  INSERT INTO audit.change_log (
    table_name, record_id, operation, old_row, new_row,
    changed_by, batch_id, restored_from_id, unrecoverable
  )
  VALUES (
    TG_TABLE_NAME,
    v_record_id,
    v_operation,
    v_old,
    v_new,
    COALESCE(audit.setting('app.actor'), 'anonymous'),
    audit.setting('app.batch_id')::uuid,
    v_restore_of,
    COALESCE(audit.setting('app.unrecoverable') = 'true', false)
  );

  RETURN NULL; -- AFTER trigger; return value is ignored
END;
$$;
