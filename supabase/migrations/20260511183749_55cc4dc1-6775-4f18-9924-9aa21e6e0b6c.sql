
-- Revoke default PUBLIC EXECUTE on all SECURITY DEFINER functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.nspname, r.proname, r.args);
  END LOOP;
END$$;

-- Re-grant EXECUTE to authenticated for functions that MUST be callable
-- (role-check helpers used by RLS policies, and app-callable utilities)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_roles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_sector_names(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superuser(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_contacts(uuid, uuid, boolean, boolean) TO authenticated;
