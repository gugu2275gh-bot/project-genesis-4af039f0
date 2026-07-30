-- 1) Notifications: restrict recipient to an existing active internal profile
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
CREATE POLICY "Staff can create notifications for valid users"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), ARRAY['ADMIN'::app_role,'MANAGER'::app_role,'ATENCAO_CLIENTE'::app_role,'JURIDICO'::app_role,'FINANCEIRO'::app_role,'TECNICO'::app_role])
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = notifications.user_id AND p.is_active = true
  )
);

-- 2) Profiles: block self-escalation of sensitive columns
CREATE OR REPLACE FUNCTION public.prevent_profile_sensitive_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'ADMIN'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'You cannot change your profile id';
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'You cannot change your own account status';
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'You cannot change your own registered email';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_profile_sensitive_self_update() FROM anon, authenticated;

DROP TRIGGER IF EXISTS prevent_profile_sensitive_self_update_trg ON public.profiles;
CREATE TRIGGER prevent_profile_sensitive_self_update_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_sensitive_self_update();