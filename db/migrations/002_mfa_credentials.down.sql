ALTER TABLE users
  DROP COLUMN IF EXISTS mfa_last_used_counter,
  DROP COLUMN IF EXISTS mfa_pending_secret_ciphertext;
