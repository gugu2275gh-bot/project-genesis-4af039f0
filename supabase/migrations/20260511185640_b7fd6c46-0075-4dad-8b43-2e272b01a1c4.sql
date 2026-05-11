-- Restrict WhatsApp media listing/reading via Storage API to staff only.
DROP POLICY IF EXISTS "Authenticated users can read whatsapp media" ON storage.objects;
DROP POLICY IF EXISTS "Staff can read whatsapp media" ON storage.objects;
CREATE POLICY "Staff can read whatsapp media"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'whatsapp-media'
    AND public.has_any_role(auth.uid(), ARRAY[
      'ADMIN','MANAGER','SUPERVISOR','DIRETORIA','ATENCAO_CLIENTE','ATENDENTE_WHATSAPP'
    ]::public.app_role[])
  );

-- Fix mutable search_path on remaining SECURITY DEFINER trigger helper.
ALTER FUNCTION public.update_contract_payment_status() SET search_path = public;

-- Reduce role/sector enumeration via SECURITY DEFINER helpers while keeping RLS use cases.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    _user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.user_roles caller_roles
      WHERE caller_roles.user_id = auth.uid()
        AND caller_roles.role = ANY (ARRAY['ADMIN','MANAGER']::public.app_role[])
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.user_roles target_roles
    WHERE target_roles.user_id = _user_id
      AND target_roles.role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    _user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.user_roles caller_roles
      WHERE caller_roles.user_id = auth.uid()
        AND caller_roles.role = ANY (ARRAY['ADMIN','MANAGER']::public.app_role[])
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.user_roles target_roles
    WHERE target_roles.user_id = _user_id
      AND target_roles.role = ANY(_roles)
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id uuid)
RETURNS public.app_role[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(ARRAY_AGG(target_roles.role), ARRAY[]::public.app_role[])
  FROM public.user_roles target_roles
  WHERE target_roles.user_id = _user_id
    AND (
      _user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.user_roles caller_roles
        WHERE caller_roles.user_id = auth.uid()
          AND caller_roles.role = ANY (ARRAY['ADMIN','MANAGER']::public.app_role[])
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.get_user_sector_names(_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(ss.name), ARRAY[]::text[])
  FROM public.user_sectors us
  JOIN public.service_sectors ss ON ss.id = us.sector_id
  WHERE us.user_id = _user_id
    AND (
      _user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.user_roles caller_roles
        WHERE caller_roles.user_id = auth.uid()
          AND caller_roles.role = ANY (ARRAY['ADMIN','MANAGER']::public.app_role[])
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.is_superuser(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (_user_id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.superusers
      WHERE user_id = _user_id
    )
$$;

-- Contact merge no longer bypasses RLS.
ALTER FUNCTION public.merge_contacts(uuid, uuid, boolean, boolean) SECURITY INVOKER;

-- Re-grant intended app-callable EXECUTE after CREATE OR REPLACE.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_roles(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_sector_names(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superuser(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_contacts(uuid, uuid, boolean, boolean) TO authenticated;