CREATE OR REPLACE FUNCTION public.ensure_commission_for_confirmed_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contract_id uuid;
  v_referral text;
  v_rate numeric;
  v_base_amount numeric;
  v_existing_id uuid;
BEGIN
  IF NEW.status <> 'CONFIRMADO' THEN
    RETURN NEW;
  END IF;

  v_contract_id := NEW.contract_id;

  IF v_contract_id IS NULL AND NEW.opportunity_id IS NOT NULL THEN
    SELECT c.id
    INTO v_contract_id
    FROM public.contracts c
    WHERE c.opportunity_id = NEW.opportunity_id
    ORDER BY c.created_at DESC
    LIMIT 1;
  END IF;

  IF v_contract_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    NULLIF(trim(ct.referral_name), ''),
    COALESCE(NULLIF(c.total_fee, 0), NULLIF(o.total_amount, 0), NEW.amount, 0)
  INTO v_referral, v_base_amount
  FROM public.contracts c
  LEFT JOIN public.opportunities o ON o.id = COALESCE(c.opportunity_id, NEW.opportunity_id)
  LEFT JOIN public.leads l ON l.id = o.lead_id
  LEFT JOIN public.contacts ct ON ct.id = l.contact_id
  WHERE c.id = v_contract_id;

  IF v_referral IS NULL OR COALESCE(v_base_amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(value, '')::numeric / 100.0
  INTO v_rate
  FROM public.system_config
  WHERE key = 'default_commission_rate';
  v_rate := COALESCE(v_rate, 0.10);

  SELECT id INTO v_existing_id
  FROM public.commissions
  WHERE contract_id = v_contract_id
    AND collaborator_type = 'CAPTADOR'
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    INSERT INTO public.commissions (
      contract_id, collaborator_name, collaborator_type,
      base_amount, commission_rate, commission_amount,
      has_invoice, status
    ) VALUES (
      v_contract_id, v_referral, 'CAPTADOR',
      v_base_amount, v_rate, ROUND(v_base_amount * v_rate, 2),
      false, 'PENDENTE_APROVACAO'
    );
  ELSE
    UPDATE public.commissions
    SET base_amount = v_base_amount,
        commission_rate = COALESCE(commission_rate, v_rate),
        commission_amount = ROUND(v_base_amount * COALESCE(commission_rate, v_rate), 2),
        collaborator_name = v_referral,
        updated_at = now()
    WHERE id = v_existing_id
      AND status IN ('PENDENTE', 'PENDENTE_APROVACAO');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_commission_for_confirmed_payment ON public.payments;
CREATE TRIGGER trg_ensure_commission_for_confirmed_payment
AFTER INSERT OR UPDATE OF status ON public.payments
FOR EACH ROW
WHEN (NEW.status = 'CONFIRMADO')
EXECUTE FUNCTION public.ensure_commission_for_confirmed_payment();

WITH confirmed_payments AS (
  SELECT DISTINCT ON (COALESCE(p.contract_id, c.id))
    COALESCE(p.contract_id, c.id) AS contract_id,
    NULLIF(trim(ct.referral_name), '') AS collaborator_name,
    COALESCE(NULLIF(c.total_fee, 0), NULLIF(o.total_amount, 0), p.amount, 0) AS base_amount,
    COALESCE((SELECT NULLIF(value, '')::numeric / 100.0 FROM public.system_config WHERE key = 'default_commission_rate'), 0.10) AS commission_rate
  FROM public.payments p
  LEFT JOIN public.contracts c ON c.id = p.contract_id OR (p.contract_id IS NULL AND c.opportunity_id = p.opportunity_id)
  LEFT JOIN public.opportunities o ON o.id = COALESCE(c.opportunity_id, p.opportunity_id)
  LEFT JOIN public.leads l ON l.id = o.lead_id
  LEFT JOIN public.contacts ct ON ct.id = l.contact_id
  WHERE p.status = 'CONFIRMADO'
    AND COALESCE(p.contract_id, c.id) IS NOT NULL
    AND NULLIF(trim(ct.referral_name), '') IS NOT NULL
    AND COALESCE(NULLIF(c.total_fee, 0), NULLIF(o.total_amount, 0), p.amount, 0) > 0
  ORDER BY COALESCE(p.contract_id, c.id), p.updated_at DESC NULLS LAST, p.created_at DESC
)
INSERT INTO public.commissions (
  contract_id, collaborator_name, collaborator_type,
  base_amount, commission_rate, commission_amount,
  has_invoice, status
)
SELECT
  cp.contract_id,
  cp.collaborator_name,
  'CAPTADOR',
  cp.base_amount,
  cp.commission_rate,
  ROUND(cp.base_amount * cp.commission_rate, 2),
  false,
  'PENDENTE_APROVACAO'
FROM confirmed_payments cp
WHERE NOT EXISTS (
  SELECT 1
  FROM public.commissions cm
  WHERE cm.contract_id = cp.contract_id
    AND cm.collaborator_type = 'CAPTADOR'
);