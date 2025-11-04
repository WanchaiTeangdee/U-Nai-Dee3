-- Migration: add email verification columns (fallback for MySQL < 8)
-- Run this if your server doesn't support ADD COLUMN IF NOT EXISTS.

ALTER TABLE users
  ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE users
  ADD COLUMN email_verified_at DATETIME NULL;
