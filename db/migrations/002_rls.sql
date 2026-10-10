-- Limited role the app connects as (NOT a superuser, cannot bypass RLS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'app_password' NOSUPERUSER NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT ON roles TO app_user;
GRANT SELECT, INSERT, UPDATE ON tenants TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, bookings TO app_user;

-- Reads the tenant id the app sets for the current transaction
CREATE FUNCTION current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.current_tenant', true), '')::uuid
$$;

-- Lets login find a tenant by its slug before any tenant is selected
CREATE FUNCTION resolve_tenant(p_slug text) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM tenants WHERE slug = p_slug
$$;
GRANT EXECUTE ON FUNCTION resolve_tenant(text) TO app_user;

-- Turn on RLS (FORCE also applies it to the table owner)
ALTER TABLE tenants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants  FORCE  ROW LEVEL SECURITY;
ALTER TABLE users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE users    FORCE  ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenants
  USING (id = current_tenant_id())
  WITH CHECK (id = current_tenant_id());

CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY tenant_isolation ON bookings
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());