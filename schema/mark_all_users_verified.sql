-- Migration: mark all existing users as verified
-- Run this script once to align legacy records with the new auto-verified flow.

UPDATE users
SET email_verified = 1,
    email_verified_at = COALESCE(email_verified_at, NOW())
WHERE email_verified IS NULL OR email_verified = 0;
