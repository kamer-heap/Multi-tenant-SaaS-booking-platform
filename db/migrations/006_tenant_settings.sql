CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT 'UTC',
  default_duration_minutes integer NOT NULL DEFAULT 60
    CHECK (default_duration_minutes BETWEEN 5 AND 480),
  brand_color text NOT NULL DEFAULT '#2563eb',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON tenant_settings;
CREATE POLICY tenant_isolation ON tenant_settings
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON tenant_settings TO app_user;