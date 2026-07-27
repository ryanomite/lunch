CREATE TABLE IF NOT EXISTS users (
  name           VARCHAR(40) PRIMARY KEY,
  color          VARCHAR(7)  NOT NULL DEFAULT '#ef4444',
  is_admin       TINYINT(1)  NOT NULL DEFAULT 0,
  last_used_at   TIMESTAMP   NULL,
  last_edit_at   TIMESTAMP   NULL,
  created_at     TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS restaurants (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(180) NOT NULL,
  place_id         VARCHAR(255) DEFAULT NULL,
  address          VARCHAR(255) DEFAULT NULL,
  lat              DECIMAL(10,7) DEFAULT NULL,
  lng              DECIMAL(10,7) DEFAULT NULL,
  distance_minutes INT          DEFAULT NULL,
  wait_time        VARCHAR(20)  DEFAULT NULL,
  sunday_hours     VARCHAR(60)  DEFAULT NULL,
  price_tier       TINYINT      DEFAULT NULL,
  notes            TEXT         DEFAULT NULL,
  created_by       VARCHAR(40)  DEFAULT NULL,
  updated_by       VARCHAR(40)  DEFAULT NULL,
  created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at       TIMESTAMP    NULL,
  UNIQUE KEY uq_place_id (place_id)
);

CREATE TABLE IF NOT EXISTS tags (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  label        VARCHAR(40) NOT NULL UNIQUE,
  icon         VARCHAR(80) NOT NULL DEFAULT '',
  created_by   VARCHAR(40) DEFAULT NULL,
  created_at   TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS restaurant_tags (
  restaurant_id INT NOT NULL,
  tag_id        INT NOT NULL,
  PRIMARY KEY (restaurant_id, tag_id),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)        REFERENCES tags(id)        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS visits (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT NOT NULL,
  visit_date    DATE NOT NULL,
  created_by    VARCHAR(40) DEFAULT NULL,
  created_at    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_restaurant_date (restaurant_id, visit_date),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS favorites (
  restaurant_id INT NOT NULL,
  user_name     VARCHAR(40) NOT NULL,
  created_at    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (restaurant_id, user_name),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  FOREIGN KEY (user_name)     REFERENCES users(name)     ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  setting_key   VARCHAR(60) PRIMARY KEY,
  setting_value TEXT,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
