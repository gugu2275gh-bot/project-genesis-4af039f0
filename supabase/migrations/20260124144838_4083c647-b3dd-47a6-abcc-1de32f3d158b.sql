-- Add new columns to contracts table
ALTER TABLE contracts
ADD COLUMN IF NOT EXISTS contract_number text,
ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS down_payment numeric,
ADD COLUMN IF NOT EXISTS down_payment_date date,
ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'TRANSFERENCIA',
ADD COLUMN IF NOT EXISTS payment_account text;

-- Create sequence for contract numbers
CREATE SEQUENCE IF NOT EXISTS contract_number_seq START 1;

-- Function to generate contract number automatically
CREATE OR REPLACE FUNCTION generate_contract_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contract_number IS NULL THEN
    NEW.contract_number := 'CTR-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(NEXTVAL('contract_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate contract number on insert
DROP TRIGGER IF EXISTS set_contract_number ON contracts;
CREATE TRIGGER set_contract_number
  BEFORE INSERT ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION generate_contract_number();

-- Add index for assigned_to_user_id
CREATE INDEX IF NOT EXISTS idx_contracts_assigned_to ON contracts(assigned_to_user_id);