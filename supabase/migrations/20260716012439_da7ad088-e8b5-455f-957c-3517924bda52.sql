-- Recalculate existing invoices based on contract payments (gross - discount, net of VAT).
-- The calculate_invoice_totals trigger will recompute vat_amount and total_amount from amount_without_vat.

WITH pay_agg AS (
  SELECT
    p.contract_id,
    SUM(COALESCE(p.gross_amount, p.amount, 0)) AS gross_total,
    (ARRAY_AGG(p.discount_value ORDER BY p.installment_number NULLS LAST, p.created_at))[1] AS discount_value,
    (ARRAY_AGG(p.discount_type  ORDER BY p.installment_number NULLS LAST, p.created_at))[1] AS discount_type
  FROM public.payments p
  WHERE p.contract_id IS NOT NULL
  GROUP BY p.contract_id
),
calc AS (
  SELECT
    i.id AS invoice_id,
    GREATEST(
      0,
      pa.gross_total - CASE
        WHEN pa.discount_type = 'PERCENTUAL' THEN pa.gross_total * COALESCE(pa.discount_value, 0) / 100.0
        ELSE COALESCE(pa.discount_value, 0)
      END
    ) AS net_total,
    COALESCE(i.vat_rate, 0.21) AS rate
  FROM public.invoices i
  JOIN pay_agg pa ON pa.contract_id = i.contract_id
)
UPDATE public.invoices i
SET amount_without_vat = ROUND((c.net_total / (1 + c.rate))::numeric, 2)
FROM calc c
WHERE i.id = c.invoice_id
  AND c.net_total > 0
  AND ROUND((c.net_total / (1 + c.rate))::numeric, 2) IS DISTINCT FROM i.amount_without_vat;