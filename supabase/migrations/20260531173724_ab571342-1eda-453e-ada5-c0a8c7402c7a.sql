
-- Restrict EXECUTE on SECURITY DEFINER functions: revoke from PUBLIC/anon,
-- grant only to roles that legitimately need them.

-- App helper functions (called from RLS / client via authenticated session)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_roles(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_roles(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_sector_names(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_user_sector_names(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_superuser(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_superuser(uuid) TO authenticated, service_role;

-- Admin/maintenance functions: service_role only
REVOKE EXECUTE ON FUNCTION public.cleanup_test_data() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_test_data() TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_dedup_entries() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_old_dedup_entries() TO service_role;

-- Knowledge base search: only edge functions / service_role
REVOKE EXECUTE ON FUNCTION public.match_knowledge_base(vector, integer, double precision) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.match_knowledge_base(vector, integer, double precision) TO service_role;

-- Contact merge utility: ADMIN/MANAGER use it via authenticated session;
-- internal checks still apply via RLS on underlying tables.
REVOKE EXECUTE ON FUNCTION public.merge_contacts(uuid, uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.merge_contacts(uuid, uuid, boolean, boolean) TO authenticated, service_role;
