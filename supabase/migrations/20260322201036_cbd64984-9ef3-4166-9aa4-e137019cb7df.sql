-- Fix contacts that were stored with WhatsApp LID instead of real phone number
UPDATE contacts SET phone = '34611137425' WHERE id = 'f580dbdc-3d34-4b95-859a-1d2751d24136' AND phone = '193171137020042';
UPDATE contacts SET phone = '553186200110' WHERE id = '83b687d1-b176-4f93-9276-0c47a33b4ca5' AND phone = '210096999145544';
UPDATE contacts SET phone = '553175451838' WHERE id = '31b6509b-47b7-46db-9015-88742f756180' AND phone = '16273698230492';
