
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
BEGIN
  IF NEW.opportunity_id IS NULL OR COALESCE(NEW.total_fee, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(trim(ct.referral_name), '')
    INTO v_referral
  FROM opportunities o
  JOIN leads l ON l.id = o.lead_id
  JOIN contacts ct ON ct.id = l.contact_id
  WHERE o.id = NEW.opportunity_id;

  IF v_referral IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT (NULLIF(value, '')::numeric) / 100.0
    INTO v_rate
  FROM system_config
  WHERE key = 'default_commission_rate';
  v_rate := COALESCE(v_rate, 0.10);

  SELECT id INTO v_existing_id
  FROM commissions
  WHERE contract_id = NEW.id
  LIMIT 1;

  IF v_existing_id IS NULL THEN
    INSERT INTO commissions (
      contract_id, collaborator_name, collaborator_type,
      base_amount, commission_rate, commission_amount,
      has_invoice, status
    ) VALUES (
      NEW.id, v_referral, 'CAPTADOR',
      NEW.total_fee, v_rate, ROUND(NEW.total_fee * v_rate, 2),
      false, 'PENDENTE_APROVACAO'
    );
  ELSE
    UPDATE commissions
       SET base_amount = NEW.total_fee,
           commission_amount = ROUND(NEW.total_fee * commission_rate, 2),
           collaborator_name = v_referral,
           updated_at = now()
     WHERE id = v_existing_id
       AND status = 'PENDENTE_APROVACAO';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_referral_commission ON public.contracts;
CREATE TRIGGER trg_auto_create_referral_commission
AFTER INSERT OR UPDATE OF total_fee, opportunity_id ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_referral_commission();

-- Backfill: contratos atuais com indicação que não têm comissão
INSERT INTO commissions (
  contract_id, collaborator_name, collaborator_type,
  base_amount, commission_rate, commission_amount,
  has_invoice, status
)
SELECT
  co.id,
  trim(ct.referral_name),
  'CAPTADOR',
  COALESCE(co.total_fee, 0),
  COALESCE((SELECT NULLIF(value,'')::numeric/100.0 FROM system_config WHERE key='default_commission_rate'), 0.10),
  ROUND(COALESCE(co.total_fee,0) * COALESCE((SELECT NULLIF(value,'')::numeric/100.0 FROM system_config WHERE key='default_commission_rate'), 0.10), 2),
  false,
  'PENDENTE_APROVACAO'
FROM contracts co
JOIN opportunities o ON o.id = co.opportunity_id
JOIN leads l ON l.id = o.lead_id
JOIN contacts ct ON ct.id = l.contact_id
WHERE ct.referral_name IS NOT NULL
  AND trim(ct.referral_name) <> ''
  AND COALESCE(co.total_fee, 0) > 0
  AND NOT EXISTS (SELECT 1 FROM commissions c WHERE c.contract_id = co.id);
