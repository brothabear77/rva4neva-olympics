-- Sign-ups no longer wait for the admin, so the requests table (and the phone numbers in it) goes.
DROP TABLE "app"."claim_requests" CASCADE;