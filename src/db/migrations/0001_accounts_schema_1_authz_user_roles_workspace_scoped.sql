-- ACCOUNTS-SCHEMA-1 – Align authz tables to authz schema and workspace-scoped user_roles
--
-- Goals:
-- - Ensure authz schema exists
-- - Move existing authz tables from public -> authz (if present)
-- - Update authz.user_roles to (user_id uuid, workspace_id uuid, role_key text)
--   with PK (user_id, workspace_id, role_key) and FK role_key -> authz.roles(key)

CREATE SCHEMA IF NOT EXISTS authz;

DO $$
BEGIN
  -- Move tables into authz schema (non-destructive, preserves data/constraints)
  IF to_regclass('public.permissions') IS NOT NULL AND to_regclass('authz.permissions') IS NULL THEN
    ALTER TABLE public.permissions SET SCHEMA authz;
  END IF;

  IF to_regclass('public.roles') IS NOT NULL AND to_regclass('authz.roles') IS NULL THEN
    ALTER TABLE public.roles SET SCHEMA authz;
  END IF;

  IF to_regclass('public.role_permissions') IS NOT NULL AND to_regclass('authz.role_permissions') IS NULL THEN
    ALTER TABLE public.role_permissions SET SCHEMA authz;
  END IF;

  IF to_regclass('public.user_roles') IS NOT NULL AND to_regclass('authz.user_roles') IS NULL THEN
    ALTER TABLE public.user_roles SET SCHEMA authz;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('authz.user_roles') IS NULL THEN
    RETURN;
  END IF;

  -- If user_roles is already in the desired shape, do nothing.
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'authz' AND table_name = 'user_roles' AND column_name = 'role_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'authz' AND table_name = 'user_roles' AND column_name = 'role_key'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'authz' AND table_name = 'user_roles' AND column_name = 'user_id' AND data_type = 'uuid'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'authz' AND table_name = 'user_roles' AND column_name = 'workspace_id' AND data_type = 'uuid'
  ) THEN
    RETURN;
  END IF;

  -- Add role_key (derived from role_id -> roles.key), then drop role_id
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'authz' AND table_name = 'user_roles' AND column_name = 'role_key'
  ) THEN
    ALTER TABLE authz.user_roles ADD COLUMN role_key text;
    -- Populate role_key from existing role_id mapping (if role_id exists)
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'authz' AND table_name = 'user_roles' AND column_name = 'role_id'
    ) THEN
      UPDATE authz.user_roles ur
      SET role_key = r.key
      FROM authz.roles r
      WHERE ur.role_id = r.id;
    END IF;
  END IF;

  -- Create the new correctly-typed table and migrate only valid UUID rows.
  -- NOTE: Legacy environments may contain non-UUID workspace_id/user_id values.
  -- We preserve those rows in a legacy table instead of failing migrations.
  IF to_regclass('authz.user_roles_new') IS NULL THEN
    CREATE TABLE authz.user_roles_new (
      user_id uuid NOT NULL,
      workspace_id uuid NOT NULL,
      role_key text NOT NULL REFERENCES authz.roles(key),
      CONSTRAINT user_roles_new_user_id_workspace_id_role_key_pk PRIMARY KEY (user_id, workspace_id, role_key)
    );
  END IF;

  INSERT INTO authz.user_roles_new (user_id, workspace_id, role_key)
  SELECT
    (ur.user_id::text)::uuid,
    (ur.workspace_id::text)::uuid,
    ur.role_key
  FROM authz.user_roles ur
  WHERE ur.role_key IS NOT NULL
    AND ur.user_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND ur.workspace_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ON CONFLICT DO NOTHING;

  -- Drop legacy constraints if present
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'authz.user_roles'::regclass AND conname = 'user_roles_workspace_id_user_id_role_id_pk'
  ) THEN
    ALTER TABLE authz.user_roles DROP CONSTRAINT user_roles_workspace_id_user_id_role_id_pk;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'authz.user_roles'::regclass AND conname = 'user_roles_role_id_roles_id_fk'
  ) THEN
    ALTER TABLE authz.user_roles DROP CONSTRAINT user_roles_role_id_roles_id_fk;
  END IF;

  -- Swap tables: keep the original for inspection/back-compat of bad rows.
  IF to_regclass('authz.user_roles_legacy') IS NULL THEN
    ALTER TABLE authz.user_roles RENAME TO user_roles_legacy;
  ELSE
    -- If legacy already exists, preserve the current table under a timestamped name
    -- to avoid any possibility of data loss.
    EXECUTE 'ALTER TABLE authz.user_roles RENAME TO '
      || quote_ident('user_roles_legacy_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS'));
  END IF;

  ALTER TABLE authz.user_roles_new RENAME TO user_roles;

  -- Normalize constraint names (keeps DB metadata predictable across environments)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'authz.user_roles'::regclass AND conname = 'user_roles_new_user_id_workspace_id_role_key_pk'
  ) THEN
    ALTER TABLE authz.user_roles
      RENAME CONSTRAINT user_roles_new_user_id_workspace_id_role_key_pk TO user_roles_pkey;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'authz.user_roles'::regclass AND conname = 'user_roles_new_role_key_fkey'
  ) THEN
    ALTER TABLE authz.user_roles
      RENAME CONSTRAINT user_roles_new_role_key_fkey TO user_roles_role_key_fkey;
  END IF;
END $$;
