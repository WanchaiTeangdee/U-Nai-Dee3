CREATE TABLE listing_conversations (
    id INT(10) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    listing_id INT(10) UNSIGNED NOT NULL,
    customer_id INT(10) UNSIGNED NOT NULL,
    landlord_id INT(10) UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_listing_customer (listing_id, customer_id),
    KEY idx_landlord (landlord_id),
    CONSTRAINT fk_listing_conv_listing FOREIGN KEY (listing_id) REFERENCES listings (id) ON DELETE CASCADE,
    CONSTRAINT fk_listing_conv_customer FOREIGN KEY (customer_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_listing_conv_landlord FOREIGN KEY (landlord_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE listing_messages (
    id INT(10) UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT(10) UNSIGNED NOT NULL,
    sender_id INT(10) UNSIGNED NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP NULL DEFAULT NULL,
    CONSTRAINT fk_listing_msg_conversation FOREIGN KEY (conversation_id) REFERENCES listing_conversations (id) ON DELETE CASCADE,
    CONSTRAINT fk_listing_msg_sender FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE,
    KEY idx_listing_messages_conversation (conversation_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
