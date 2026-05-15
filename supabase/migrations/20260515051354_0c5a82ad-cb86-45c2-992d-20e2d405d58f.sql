ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_status_check;
ALTER TABLE public.commissions ADD CONSTRAINT commissions_status_check
  CHECK (status = ANY (ARRAY['PENDENTE'::text, 'PENDENTE_APROVACAO'::text, 'APROVADA'::text, 'PAGA'::text, 'REJEITADA'::text, 'CANCELADA'::text]));

INSERT INTO public.commissions (
  contract_id, collaborator_name, collaborator_type,
  base_amount, commission_rate, commission_amount,
  has_invoice, status
)
SELECT
  c.id,
  trim(ct.referral_name),
  'CAPTADOR',
  COALESCE(c.total_fee, o.total_amount, 0),
  COALESCE((SELECT (NULLIF(value,'')::numeric)/100.0 FROM public.system_config WHERE key='default_commission_rate'), 0.10),
  ROUND(
    COALESCE(c.total_fee, o.total_amount, 0)
    * COALESCE((SELECT (NULLIF(value,'')::numeric)/100.0 FROM public.system_config WHERE key='default_commission_rate'), 0.10),
    2
  ),
  false,
  'PENDENTE_APROVACAO'
FROM public.contracts c
JOIN public.opportunities o ON o.id = c.opportunity_id
JOIN public.leads l ON l.id = o.lead_id
JOIN public.contacts ct ON ct.id = l.contact_id
WHERE NULLIF(trim(ct.referral_name), '') IS NOT NULL
  AND COALESCE(c.total_fee, o.total_amount, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.commissions cm
    WHERE cm.contract_id = c.id AND cm.collaborator_type = 'CAPTADOR'
  );