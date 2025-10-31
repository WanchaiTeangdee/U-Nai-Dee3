-- Add phone and last_login fields to users table
-- Run this SQL to update the existing users table

USE `rental_app`;

-- Add phone field if it doesn't exist
SET @column_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'phone'
);

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT NULL AFTER name',
    'SELECT "phone column already exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add last_login field if it doesn't exist
SET @column_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'last_login'
);

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE users ADD COLUMN last_login TIMESTAMP NULL DEFAULT NULL AFTER created_at',
    'SELECT "last_login column already exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add avatar field if it doesn't exist
SET @column_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'avatar'
);

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE users ADD COLUMN avatar VARCHAR(255) DEFAULT NULL AFTER phone',
    'SELECT "avatar column already exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add email_verified field for account verification
SET @column_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'users'
    AND COLUMN_NAME = 'email_verified'
);

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER avatar',
    'SELECT "email_verified column already exists"'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;