ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'stripe_events'
       AND column_name = 'processed_at'
  ) THEN
    ALTER TABLE stripe_events RENAME COLUMN processed_at TO received_at;
  ELSIF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'stripe_events'
       AND column_name = 'received_at'
  ) THEN
    ALTER TABLE stripe_events ADD COLUMN received_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

ALTER TABLE stripe_events
  ALTER COLUMN received_at SET DEFAULT now();

ALTER TABLE invoices
  ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON invoices TO app_user;
GRANT SELECT ON stripe_events TO app_user;
