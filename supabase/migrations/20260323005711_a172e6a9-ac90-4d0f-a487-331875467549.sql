
-- Move ALL interactions from duplicate leads to original lead
UPDATE interactions SET lead_id = '18f83cb4-f3f5-45ad-bacb-21081f1338ed'
WHERE lead_id IN (
  '148cf34c-035a-4953-a3ee-70e7658bb234',
  '755c08e5-6aeb-41d1-add9-c81d207157cd',
  'ff0a14a5-8c96-441f-92dd-a083f295a5c7',
  '9f0efecf-fd39-4b6c-a355-11d5e2dab052',
  '3a9a7362-abd4-4866-97ee-af19696b3ec7',
  'b88e66da-18ad-465c-b5aa-c5cf69c1e76a'
);

-- Move mensagens_cliente from ALL duplicate leads
UPDATE mensagens_cliente SET id_lead = '18f83cb4-f3f5-45ad-bacb-21081f1338ed'
WHERE id_lead IN (
  '148cf34c-035a-4953-a3ee-70e7658bb234',
  '755c08e5-6aeb-41d1-add9-c81d207157cd',
  'ff0a14a5-8c96-441f-92dd-a083f295a5c7',
  '9f0efecf-fd39-4b6c-a355-11d5e2dab052',
  '3a9a7362-abd4-4866-97ee-af19696b3ec7',
  'b88e66da-18ad-465c-b5aa-c5cf69c1e76a'
);

-- Move interactions from duplicate contacts
UPDATE interactions SET contact_id = '900acf9d-7b1c-4987-b215-3ea96f14121c'
WHERE contact_id IN (
  '83b687d1-b176-4f93-9276-0c47a33b4ca5',
  '265bc23c-6e2a-4218-9293-99349c183137',
  'd6310d96-8449-403d-a9d4-46cb1c31af47'
);

-- Move tasks from duplicate leads
UPDATE tasks SET related_lead_id = '18f83cb4-f3f5-45ad-bacb-21081f1338ed'
WHERE related_lead_id IN (
  '148cf34c-035a-4953-a3ee-70e7658bb234',
  '755c08e5-6aeb-41d1-add9-c81d207157cd',
  'ff0a14a5-8c96-441f-92dd-a083f295a5c7',
  '9f0efecf-fd39-4b6c-a355-11d5e2dab052',
  '3a9a7362-abd4-4866-97ee-af19696b3ec7',
  'b88e66da-18ad-465c-b5aa-c5cf69c1e76a'
);

-- Move pending items from duplicate contacts
UPDATE customer_sector_pending_items SET contact_id = '900acf9d-7b1c-4987-b215-3ea96f14121c'
WHERE contact_id IN (
  '83b687d1-b176-4f93-9276-0c47a33b4ca5',
  '265bc23c-6e2a-4218-9293-99349c183137',
  'd6310d96-8449-403d-a9d4-46cb1c31af47'
);

-- Move pending items from duplicate leads
UPDATE customer_sector_pending_items SET lead_id = '18f83cb4-f3f5-45ad-bacb-21081f1338ed'
WHERE lead_id IN (
  '148cf34c-035a-4953-a3ee-70e7658bb234',
  '755c08e5-6aeb-41d1-add9-c81d207157cd',
  'ff0a14a5-8c96-441f-92dd-a083f295a5c7',
  '9f0efecf-fd39-4b6c-a355-11d5e2dab052',
  '3a9a7362-abd4-4866-97ee-af19696b3ec7',
  'b88e66da-18ad-465c-b5aa-c5cf69c1e76a'
);

-- Now delete duplicate leads
DELETE FROM leads WHERE id IN (
  '148cf34c-035a-4953-a3ee-70e7658bb234',
  '755c08e5-6aeb-41d1-add9-c81d207157cd',
  'ff0a14a5-8c96-441f-92dd-a083f295a5c7',
  '9f0efecf-fd39-4b6c-a355-11d5e2dab052',
  '3a9a7362-abd4-4866-97ee-af19696b3ec7',
  'b88e66da-18ad-465c-b5aa-c5cf69c1e76a'
);

-- Delete chat context for duplicate contacts
DELETE FROM customer_chat_context WHERE contact_id IN (
  '83b687d1-b176-4f93-9276-0c47a33b4ca5',
  '265bc23c-6e2a-4218-9293-99349c183137',
  'd6310d96-8449-403d-a9d4-46cb1c31af47'
);

-- Delete chat routing logs for duplicate contacts
DELETE FROM chat_routing_logs WHERE contact_id IN (
  '83b687d1-b176-4f93-9276-0c47a33b4ca5',
  '265bc23c-6e2a-4218-9293-99349c183137',
  'd6310d96-8449-403d-a9d4-46cb1c31af47'
);

-- Delete duplicate contacts
DELETE FROM contacts WHERE id IN (
  '83b687d1-b176-4f93-9276-0c47a33b4ca5',
  '265bc23c-6e2a-4218-9293-99349c183137',
  'd6310d96-8449-403d-a9d4-46cb1c31af47'
);
