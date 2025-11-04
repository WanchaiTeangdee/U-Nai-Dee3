-- Adds last_login tracking to the users table.

USE `rental_app`;

ALTER TABLE `users`
	ADD COLUMN IF NOT EXISTS `last_login` DATETIME NULL AFTER `email_verified_at`;
