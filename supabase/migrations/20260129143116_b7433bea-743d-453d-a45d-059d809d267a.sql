-- Add post-protocol pending tracking fields to service_documents
ALTER TABLE service_documents 
ADD COLUMN IF NOT EXISTS is_post_protocol_pending BOOLEAN DEFAULT false;

ALTER TABLE service_documents 
ADD COLUMN IF NOT EXISTS post_protocol_pending_since TIMESTAMPTZ;

-- Add index for efficient querying of pending post-protocol documents
CREATE INDEX IF NOT EXISTS idx_service_documents_post_protocol_pending 
ON service_documents (is_post_protocol_pending) 
WHERE is_post_protocol_pending = true;