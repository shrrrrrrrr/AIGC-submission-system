ALTER TABLE users
  ADD COLUMN mfa_pending_secret_ciphertext bytea,
  ADD COLUMN mfa_last_used_counter bigint;
