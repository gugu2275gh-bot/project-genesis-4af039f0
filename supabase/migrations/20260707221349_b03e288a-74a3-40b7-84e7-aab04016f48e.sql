
-- Helper: discounted base (net of IVA) from an opportunity's payments
CREATE OR REPLACE FUNCTION public.opportunity_discounted_base(_opportunity_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT GREATEST(0, ROUND((COALESCE(p.gross_amount,0) - CASE
        WHEN p.discount_type = 'PERCENTUAL' THEN COALESCE(p.gross_amount,0) * COALESCE(p.discount_value,0)/100
        ELSE COALESCE(p.discount_value,0) END)::numeric, 2))
      FROM public.payments p
      WHERE p.opportunity_id = _opportunity_id
      ORDER BY p.created_at ASC
      LIMIT 1
    ),
    (SELECT COALESCE(NULLIF(total_amount,0),0) FROM public.opportunities WHERE id = _opportunity_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.ensure_commission_for_confirmed_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contract_id uuid;
  v_opportunity_id uuid;
  v_referral text;
  v_rate numeric;
  v_base_amount numeric;
BEGIN
  IF NEW.status <> 'CONFIRMADO' THEN
    RETURN NEW;
  END IF;

  v_contract_id := NEW.contract_id;
  v_opportunity_id := NEW.opportunity_id;

  IF v_opportunity_id IS NULL AND v_contract_id IS NOT NULL THEN
    SELECT c.opportunity_id INTO v_opportunity_id FROM public.contracts c WHERE c.id = v_contract_id;
  END IF;

  IF v_contract_id IS NULL AND v_opportunity_id IS NOT NULL THEN
    SELECT c.id INTO v_contract_id
    FROM public.contracts c
    WHERE c.opportunity_id = v_opportunity_id
    ORDER BY c.created_at DESC LIMIT 1;
  END IF;

  IF v_contract_id IS NULL OR v_opportunity_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(trim(ct.referral_name), '')
    INTO v_referral
  FROM public.opportunities o
  JOIN public.leads l ON l.id = o.lead_id
  JOIN public.contacts ct ON ct.id = l.contact_id
  WHERE o.id = v_opportunity_id;

  v_base_amount := public.opportunity_discounted_base(v_opportunity_id);

  IF v_referral IS NULL OR COALESCE(v_base_amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(value, '')::numeric / 100.0 INTO v_rate
  FROM public.system_config WHERE key = 'default_commission_rate';
  v_rate := COALESCE(v_rate, 0.10);

  IF NOT EXISTS (
    SELECT 1 FROM public.commissions
    WHERE contract_id = v_contract_id
      AND opportunity_id = v_opportunity_id
      AND collaborator_type = 'CAPTADOR'
  ) THEN
    INSERT INTO public.commissions (
      contract_id, opportunity_id, collaborator_name, collaborator_type,
      base_amount, commission_rate, commission_amount,
      has_invoice, vat_enabled, status
    ) VALUES (
      v_contract_id, v_opportunity_id, v_referral, 'CAPTADOR',
      v_base_amount, v_rate, ROUND(v_base_amount * v_rate, 2),
      false, false, 'PENDENTE_APROVACAO'
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_create_referral_commission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rate numeric;
  rec record;
  v_base numeric;
BEGIN
  SELECT NULLIF(value, '')::numeric / 100.0 INTO v_rate
  FROM public.system_config WHERE key = 'default_commission_rate';
  v_rate := COALESCE(v_rate, 0.10);

  FOR rec IN
    WITH linked_opps AS (
      SELECT NEW.opportunity_id AS opp_id WHERE NEW.opportunity_id IS NOT NULL
      UNION
      SELECT o.id
      FROM public.contract_leads cl
      JOIN public.opportunities o ON o.lead_id = cl.lead_id
      WHERE cl.contract_id = NEW.id
    )
    SELECT
      o.id AS opportunity_id,
      NULLIF(trim(ct.referral_name), '') AS referral
    FROM linked_opps lo
    JOIN public.opportunities o ON o.id = lo.opp_id
    JOIN public.leads l ON l.id = o.lead_id
    JOIN public.contacts ct ON ct.id = l.contact_id
  LOOP
    v_base := public.opportunity_discounted_base(rec.opportunity_id);

    IF rec.referral IS NULL OR COALESCE(v_base, 0) <= 0 THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.commissions
      WHERE contract_id = NEW.id
        AND opportunity_id = rec.opportunity_id
        AND collaborator_type = 'CAPTADOR'
    ) THEN
      UPDATE public.commissions
      SET base_amount = v_base,
          commission_amount = ROUND(v_base * COALESCE(commission_rate, v_rate) * CASE WHEN vat_enabled THEN 1.21 ELSE 1 END, 2),
          collaborator_name = rec.referral,
          updated_at = now()
      WHERE contract_id = NEW.id
        AND opportunity_id = rec.opportunity_id
        AND collaborator_type = 'CAPTADOR'
        AND status IN ('PENDENTE', 'PENDENTE_APROVACAO');
    ELSE
      INSERT INTO public.commissions (
        contract_id, opportunity_id, collaborator_name, collaborator_type,
        base_amount, commission_rate, commission_amount,
        has_invoice, vat_enabled, status
      ) VALUES (
        NEW.id, rec.opportunity_id, rec.referral, 'CAPTADOR',
        v_base, v_rate, ROUND(v_base * v_rate, 2),
        false, false, 'PENDENTE_APROVACAO'
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;
