CREATE OR REPLACE FUNCTION public.auto_create_referral_commission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral text;
  v_rate numeric;
  v_existing_id uuid;
  v_base_amount numeric;
BEGIN
  IF NEW.opportunity_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    NULLIF(trim(ct.referral_name), ''),
    COALESCE(NEW.total_fee, o.total_amount, 0)
  INTO v_referral, v_base_amount
  FROM opportunities o
  JOIN leads l ON l.id = o.lead_id
  JOIN contacts ct ON ct.id = l.contact_id
  WHERE o.id = NEW.opportunity_id;

  IF v_referral IS NULL OR COALESCE(v_base_amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(value, '')::numeric / 100.0
  INTO v_rate
  FROM system_config
  WHERE key = 'default_commission_rate';
  v_rate := COALESCE(v_rate, 0.10);

  SELECT id INTO v_existing_id
  FROM commissions
  WHERE contract_id = NEW.id
    AND collaborator_type = 'CAPTADOR'
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    INSERT INTO commissions (
      contract_id, collaborator_name, collaborator_type,
      base_amount, commission_rate, commission_amount,
      has_invoice, status
    ) VALUES (
      NEW.id, v_referral, 'CAPTADOR',
      v_base_amount, v_rate, ROUND(v_base_amount * v_rate, 2),
      false, 'PENDENTE_APROVACAO'
    );
  ELSE
    UPDATE commissions
    SET base_amount = v_base_amount,
        commission_amount = ROUND(v_base_amount * commission_rate, 2),
        collaborator_name = v_referral,
        updated_at = now()
    WHERE id = v_existing_id
      AND status IN ('PENDENTE', 'PENDENTE_APROVACAO');
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_commission_for_confirmed_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    FROM contracts c
    WHERE c.opportunity_id = NEW.opportunity_id
    ORDER BY c.created_at DESC
    LIMIT 1;
  END IF;

  IF v_contract_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    NULLIF(trim(ct.referral_name), ''),
    COALESCE(c.total_fee, o.total_amount, NEW.amount, 0)
  INTO v_referral, v_base_amount
  FROM contracts c
  LEFT JOIN opportunities o ON o.id = COALESCE(c.opportunity_id, NEW.opportunity_id)
  LEFT JOIN leads l ON l.id = o.lead_id
  LEFT JOIN contacts ct ON ct.id = l.contact_id
  WHERE c.id = v_contract_id;

  IF v_referral IS NULL OR COALESCE(v_base_amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(value, '')::numeric / 100.0
  INTO v_rate
  FROM system_config
  WHERE key = 'default_commission_rate';
  v_rate := COALESCE(v_rate, 0.10);

  SELECT id INTO v_existing_id
  FROM commissions
  WHERE contract_id = v_contract_id
    AND collaborator_type = 'CAPTADOR'
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    INSERT INTO commissions (
      contract_id, collaborator_name, collaborator_type,
      base_amount, commission_rate, commission_amount,
      has_invoice, status
    ) VALUES (
      v_contract_id, v_referral, 'CAPTADOR',
      v_base_amount, v_rate, ROUND(v_base_amount * v_rate, 2),
      false, 'PENDENTE_APROVACAO'
    );
  ELSE
    UPDATE commissions
    SET base_amount = v_base_amount,
        commission_amount = ROUND(v_base_amount * commission_rate, 2),
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
AFTER INSERT OR UPDATE OF status, contract_id, opportunity_id, amount ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.ensure_commission_for_confirmed_payment();

WITH confirmed_referrals AS (
  SELECT DISTINCT ON (c.id)
    c.id AS contract_id,
    trim(ct.referral_name) AS collaborator_name,
    COALESCE(c.total_fee, o.total_amount, p.amount, 0) AS base_amount,
    COALESCE((SELECT NULLIF(value, '')::numeric / 100.0 FROM system_config WHERE key = 'default_commission_rate'), 0.10) AS commission_rate
  FROM payments p
  JOIN contracts c ON c.id = p.contract_id OR (p.contract_id IS NULL AND c.opportunity_id = p.opportunity_id)
  JOIN opportunities o ON o.id = COALESCE(c.opportunity_id, p.opportunity_id)
  JOIN leads l ON l.id = o.lead_id
  JOIN contacts ct ON ct.id = l.contact_id
  WHERE p.status = 'CONFIRMADO'
    AND NULLIF(trim(ct.referral_name), '') IS NOT NULL
    AND COALESCE(c.total_fee, o.total_amount, p.amount, 0) > 0
  ORDER BY c.id, p.paid_at DESC NULLS LAST, p.created_at DESC
)
INSERT INTO commissions (
  contract_id, collaborator_name, collaborator_type,
  base_amount, commission_rate, commission_amount,
  has_invoice, status
)
SELECT
  cr.contract_id,
  cr.collaborator_name,
  'CAPTADOR',
  cr.base_amount,
  cr.commission_rate,
  ROUND(cr.base_amount * cr.commission_rate, 2),
  false,
  'PENDENTE_APROVACAO'
FROM confirmed_referrals cr
WHERE NOT EXISTS (
  SELECT 1
  FROM commissions cm
  WHERE cm.contract_id = cr.contract_id
    AND cm.collaborator_type = 'CAPTADOR'
);