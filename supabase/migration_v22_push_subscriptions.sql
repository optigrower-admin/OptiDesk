-- v22: Web Push subscriptions para notificaciones cuando Chrome está cerrado

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   uuid    REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     uuid    REFERENCES usuarios(id) ON DELETE CASCADE,
  endpoint    text    NOT NULL,
  p256dh      text    NOT NULL,
  auth        text    NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Cada usuario solo ve y gestiona sus propias suscripciones
CREATE POLICY "push_subs_own" ON push_subscriptions
  USING (user_id = auth.uid());
