-- Fix existing payment: link it to the contract
UPDATE payments 
SET contract_id = 'cb9acb80-22fb-449c-93b9-0e78022d9206'
WHERE id = '3e844854-0a31-47d4-8c6e-9c57b020848b';

-- Update the contract to INICIADO since payment is already confirmed
UPDATE contracts 
SET payment_status = 'INICIADO'
WHERE id = 'cb9acb80-22fb-449c-93b9-0e78022d9206';