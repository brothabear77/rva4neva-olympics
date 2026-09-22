-- ============================================================================
-- Append-only change history.
--
-- Submitting results is deliberately open to anyone with the link, so this is
-- the safety net: every insert, update and delete against the app schema is
-- recorded, with its full before and after state, by a trigger that runs in the
-- SAME transaction as the change. A result therefore cannot exist without its
-- audit row, and no application code path can skip logging.
--
-- Attribution rides along on transaction-local settings, which the app sets via
-- set_config(...) at the top of each write transaction:
--
--   app.actor      free-text name typed on the submit form
--   app.batch_id   the CSV import this change belongs to, if any
--   app.restore_of the change_log id being reapplied, if this is a restore
-- ============================================================================

-- Read a transaction-local setting, treating unset and empty as NULL.
CREATE OR REPLACE FUNCTION audit.setting(p_name text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting(p_name, true), '');
$$;
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
    changed_by, batch_id, restored_from_id
  )
  VALUES (
    TG_TABLE_NAME,
    v_record_id,
    v_operation,
    v_old,
    v_new,
    COALESCE(audit.setting('app.actor'), 'anonymous'),
    audit.setting('app.batch_id')::uuid,
    v_restore_of
  );

  RETURN NULL; -- AFTER trigger; return value is ignored
END;
$$;
--> statement-breakpoint

-- Keep updated_at honest no matter which code path performs the write.
CREATE OR REPLACE FUNCTION app.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- History is append-only. This trigger is the portable enforcement: unlike a
-- REVOKE it also stops the table owner and the migration role, so there is no
-- ordinary path to rewriting the past. Restoring an old value is an INSERT of a
-- new entry, never an edit of an old one.
CREATE OR REPLACE FUNCTION audit.forbid_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'audit.change_log is append-only: % is not permitted', TG_OP
    USING HINT = 'To undo a change, restore the earlier version — that appends a new entry.',
          ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS change_log_no_update ON audit.change_log;
--> statement-breakpoint
CREATE TRIGGER change_log_no_update
  BEFORE UPDATE OR DELETE ON audit.change_log
  FOR EACH ROW EXECUTE FUNCTION audit.forbid_rewrite();
--> statement-breakpoint

DROP TRIGGER IF EXISTS change_log_no_truncate ON audit.change_log;
--> statement-breakpoint
CREATE TRIGGER change_log_no_truncate
  BEFORE TRUNCATE ON audit.change_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit.forbid_rewrite();
--> statement-breakpoint

-- Audit every table that holds competition state.
DROP TRIGGER IF EXISTS audit_results ON app.results;
--> statement-breakpoint
CREATE TRIGGER audit_results
  AFTER INSERT OR UPDATE OR DELETE ON app.results
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();
--> statement-breakpoint

DROP TRIGGER IF EXISTS audit_events ON app.events;
--> statement-breakpoint
CREATE TRIGGER audit_events
  AFTER INSERT OR UPDATE OR DELETE ON app.events
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();
--> statement-breakpoint

DROP TRIGGER IF EXISTS audit_athletes ON app.athletes;
--> statement-breakpoint
CREATE TRIGGER audit_athletes
  AFTER INSERT OR UPDATE OR DELETE ON app.athletes
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();
--> statement-breakpoint

DROP TRIGGER IF EXISTS touch_results ON app.results;
--> statement-breakpoint
CREATE TRIGGER touch_results
  BEFORE UPDATE ON app.results
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint

DROP TRIGGER IF EXISTS touch_events ON app.events;
--> statement-breakpoint
CREATE TRIGGER touch_events
  BEFORE UPDATE ON app.events
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
--> statement-breakpoint

-- An event whose two benchmarks are equal has no scale: every performance would
-- be worth both 0 and 1000 points. Reject it at the database, not just in the UI.
ALTER TABLE app.events
  DROP CONSTRAINT IF EXISTS events_benchmarks_differ;
--> statement-breakpoint
ALTER TABLE app.events
  ADD CONSTRAINT events_benchmarks_differ CHECK (benchmark_1000 <> benchmark_zero);
