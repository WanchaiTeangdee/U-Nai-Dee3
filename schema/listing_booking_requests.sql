CREATE TABLE IF NOT EXISTS listing_booking_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id INT UNSIGNED NOT NULL,
  owner_id INT UNSIGNED NOT NULL,
  requester_name VARCHAR(120) NOT NULL,
  requester_email VARCHAR(160) NOT NULL,
  requester_phone VARCHAR(60) NULL,
  message TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_booking_request_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  CONSTRAINT fk_booking_request_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_booking_requests_owner (owner_id, status, created_at),
  INDEX idx_booking_requests_listing (listing_id, created_at)
);
