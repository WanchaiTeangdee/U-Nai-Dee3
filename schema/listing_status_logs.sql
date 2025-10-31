CREATE TABLE IF NOT EXISTS listing_status_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id INT UNSIGNED NOT NULL,
  status VARCHAR(30) NOT NULL,
  changed_by INT UNSIGNED NULL,
  changed_by_role VARCHAR(40) NULL,
  context VARCHAR(120) NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_listing_status_logs_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  CONSTRAINT fk_listing_status_logs_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_listing_status_logs_listing (listing_id, changed_at),
  INDEX idx_listing_status_logs_status (status)
);
