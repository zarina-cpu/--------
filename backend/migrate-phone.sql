ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32);

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx
  ON users (phone)
  WHERE phone IS NOT NULL;
