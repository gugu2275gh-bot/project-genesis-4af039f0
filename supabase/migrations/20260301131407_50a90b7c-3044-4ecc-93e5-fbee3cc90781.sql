
-- First update any contracts with removed statuses
UPDATE public.contracts SET status = 'EM_ELABORACAO' WHERE status = 'EM_REVISAO';
UPDATE public.contracts SET status = 'APROVADO' WHERE status = 'ENVIADO';

-- Recreate the enum with only the desired values
ALTER TYPE public.contract_status RENAME TO contract_status_old;

CREATE TYPE public.contract_status AS ENUM (
  'EM_ELABORACAO',
  'APROVADO',
  'REPROVADO',
  'ASSINADO',
  'CANCELADO'
);

-- Update the column to use the new enum
ALTER TABLE public.contracts 
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.contract_status USING status::text::public.contract_status,
  ALTER COLUMN status SET DEFAULT 'EM_ELABORACAO'::public.contract_status;

-- Drop the old enum
DROP TYPE public.contract_status_old;
