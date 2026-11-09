-- An athlete and their account are one thing.
--
-- 1. Change History keeps only athlete deletions. Sign-ups and renames are no longer
--    logged: only the athlete or the admin can change them, so there's nothing to audit,
--    and athletes can't be restored from the history any more. A deletion is still
--    logged: it's marked unrecoverable, and it keeps the name on the deleted athlete's
--    old score entries.
DROP TRIGGER IF EXISTS audit_athletes ON app.athletes;
--> statement-breakpoint
CREATE TRIGGER audit_athletes
  AFTER DELETE ON app.athletes
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();
--> statement-breakpoint

-- 2. Every athlete has an account. Checked when the transaction commits (DEFERRABLE
--    INITIALLY DEFERRED), so creating the athlete and then its account in one
--    transaction is fine, but committing an athlete alone, or deleting an athlete's
--    account without the athlete, is refused. Rows that existed before this migration
--    aren't checked until they change: production's roster gets its accounts from
--    `npm run auth:athletes -- --prod` after deploying.
CREATE OR REPLACE FUNCTION app.check_athlete_has_account()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_athlete uuid;
BEGIN
  IF TG_TABLE_NAME = 'athletes' THEN
    v_athlete := NEW.id;
  ELSE
    v_athlete := OLD.athlete_id;
  END IF;

  IF v_athlete IS NOT NULL
     AND EXISTS (SELECT 1 FROM app.athletes WHERE id = v_athlete)
     AND NOT EXISTS (SELECT 1 FROM app.accounts WHERE athlete_id = v_athlete) THEN
    RAISE EXCEPTION 'Every athlete needs an account: athlete % has none', v_athlete
      USING ERRCODE = 'check_violation',
            HINT = 'Create athletes with createAthlete (src/lib/athleteAccounts.ts), and delete the athlete rather than the account.';
  END IF;

  RETURN NULL;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS athletes_need_account ON app.athletes;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER athletes_need_account
  AFTER INSERT ON app.athletes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.check_athlete_has_account();
--> statement-breakpoint
DROP TRIGGER IF EXISTS accounts_keep_athlete ON app.accounts;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER accounts_keep_athlete
  AFTER DELETE OR UPDATE OF athlete_id ON app.accounts
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.check_athlete_has_account();
