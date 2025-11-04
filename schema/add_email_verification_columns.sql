-- Migration: add email verification columns to users table
-- Run once before executing mark_all_users_verified.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_verified_at DATETIME NULL;
