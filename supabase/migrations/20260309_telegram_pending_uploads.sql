-- Telegram pending image uploads — replaces in-memory Map
-- Scoped by telegram_user_id to prevent multi-user race conditions

CREATE TABLE IF NOT EXISTS telegram_pending_uploads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  chat_id bigint NOT NULL,
  telegram_user_id bigint NOT NULL,
  message_id bigint,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Each telegram user can only have one pending upload at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_upload_user
  ON telegram_pending_uploads (telegram_user_id);

-- Auto-cleanup: index for expired rows
CREATE INDEX IF NOT EXISTS idx_pending_upload_expires
  ON telegram_pending_uploads (expires_at);
