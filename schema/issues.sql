CREATE TABLE IF NOT EXISTS issues (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  reporter_name VARCHAR(255) NOT NULL,
  reporter_email VARCHAR(255) DEFAULT NULL,
  reporter_role VARCHAR(50) DEFAULT NULL,
  subject VARCHAR(255) NOT NULL,
  category VARCHAR(100) DEFAULT 'ทั่วไป',
  priority ENUM('low','normal','high','urgent') DEFAULT 'normal',
  status ENUM('new','in_progress','resolved','closed') DEFAULT 'new',
  message TEXT NOT NULL,
  last_admin_note TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_issues_user_id (user_id),
  INDEX idx_issues_status (status),
  INDEX idx_issues_created (created_at),
  CONSTRAINT fk_issues_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS issue_replies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  issue_id INT NOT NULL,
  responder_id INT DEFAULT NULL,
  responder_name VARCHAR(255) DEFAULT NULL,
  message TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_issue_replies_issue FOREIGN KEY(issue_id) REFERENCES issues(id) ON DELETE CASCADE,
  CONSTRAINT fk_issue_replies_responder FOREIGN KEY(responder_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_issue_replies_issue (issue_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
