UPDATE public.payments p
SET contract_id = c.id
FROM public.contracts c
WHERE p.contract_id IS NULL
  AND p.opportunity_id = c.opportunity_id
  AND c.status IN ('APROVADO', 'ASSINADO');