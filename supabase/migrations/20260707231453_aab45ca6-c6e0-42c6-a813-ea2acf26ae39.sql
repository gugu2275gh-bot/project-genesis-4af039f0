REVOKE EXECUTE ON FUNCTION public.opportunity_discounted_base(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.opportunity_discounted_base(uuid) TO authenticated, service_role;