
-- Function to merge two contacts: moves all data from source to target, then deletes source
CREATE OR REPLACE FUNCTION public.merge_contacts(
  p_source_contact_id uuid,
  p_target_contact_id uuid,
  p_update_phone boolean DEFAULT false,
  p_update_email boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source contacts%ROWTYPE;
  v_target contacts%ROWTYPE;
  v_moved_leads int := 0;
  v_moved_interactions int := 0;
  v_moved_pending int := 0;
  v_moved_beneficiaries int := 0;
  v_moved_payments int := 0;
  v_moved_routing int := 0;
  v_moved_reactivations int := 0;
BEGIN
  -- Validate contacts exist
  SELECT * INTO v_source FROM contacts WHERE id = p_source_contact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contato de origem não encontrado';
  END IF;

  SELECT * INTO v_target FROM contacts WHERE id = p_target_contact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contato de destino não encontrado';
  END IF;

  IF p_source_contact_id = p_target_contact_id THEN
    RAISE EXCEPTION 'Não é possível mesclar um contato consigo mesmo';
  END IF;

  -- 1. Move leads
  UPDATE leads SET contact_id = p_target_contact_id
  WHERE contact_id = p_source_contact_id;
  GET DIAGNOSTICS v_moved_leads = ROW_COUNT;

  -- 2. Move interactions
  UPDATE interactions SET contact_id = p_target_contact_id
  WHERE contact_id = p_source_contact_id;
  GET DIAGNOSTICS v_moved_interactions = ROW_COUNT;

  -- 3. Move pending items
  UPDATE customer_sector_pending_items SET contact_id = p_target_contact_id
  WHERE contact_id = p_source_contact_id;
  GET DIAGNOSTICS v_moved_pending = ROW_COUNT;

  -- 4. Move/replace chat context (delete source, keep target)
  DELETE FROM customer_chat_context WHERE contact_id = p_source_contact_id;

  -- 5. Move contract beneficiaries
  UPDATE contract_beneficiaries SET contact_id = p_target_contact_id
  WHERE contact_id = p_source_contact_id;
  GET DIAGNOSTICS v_moved_beneficiaries = ROW_COUNT;

  -- 6. Move payments (beneficiary reference)
  UPDATE payments SET beneficiary_contact_id = p_target_contact_id
  WHERE beneficiary_contact_id = p_source_contact_id;
  GET DIAGNOSTICS v_moved_payments = ROW_COUNT;

  -- 7. Move chat routing logs
  UPDATE chat_routing_logs SET contact_id = p_target_contact_id
  WHERE contact_id = p_source_contact_id;
  GET DIAGNOSTICS v_moved_routing = ROW_COUNT;

  -- 8. Move reactivation resolutions
  UPDATE reactivation_resolutions SET contact_id = p_target_contact_id
  WHERE contact_id = p_source_contact_id;
  GET DIAGNOSTICS v_moved_reactivations = ROW_COUNT;

  -- 9. Move beneficiary links (contacts linking to source as principal)
  UPDATE contacts SET linked_principal_contact_id = p_target_contact_id
  WHERE linked_principal_contact_id = p_source_contact_id;

  -- 10. Optionally update phone/email on target
  IF p_update_phone AND v_source.phone IS NOT NULL AND v_source.phone <> '' THEN
    UPDATE contacts SET phone = v_source.phone WHERE id = p_target_contact_id;
  END IF;

  IF p_update_email AND v_source.email IS NOT NULL AND v_source.email <> '' THEN
    UPDATE contacts SET email = v_source.email WHERE id = p_target_contact_id;
  END IF;

  -- 11. Merge payment_notes (append source notes to target)
  IF v_source.payment_notes IS NOT NULL AND v_source.payment_notes <> '' THEN
    UPDATE contacts 
    SET payment_notes = COALESCE(payment_notes, '') || E'\n---\n' || v_source.payment_notes
    WHERE id = p_target_contact_id;
  END IF;

  -- 12. Create audit log
  INSERT INTO audit_logs (user_id, table_name, record_id, action, old_data, new_data)
  VALUES (
    auth.uid(),
    'contacts',
    p_target_contact_id::text,
    'MERGE',
    jsonb_build_object('source_contact_id', p_source_contact_id, 'source_name', v_source.full_name, 'source_phone', v_source.phone),
    jsonb_build_object(
      'moved_leads', v_moved_leads,
      'moved_interactions', v_moved_interactions,
      'moved_pending_items', v_moved_pending,
      'moved_beneficiaries', v_moved_beneficiaries,
      'moved_payments', v_moved_payments
    )
  );

  -- 13. Delete source contact
  DELETE FROM contacts WHERE id = p_source_contact_id;

  RETURN jsonb_build_object(
    'success', true,
    'source_deleted', v_source.full_name,
    'target_id', p_target_contact_id,
    'moved_leads', v_moved_leads,
    'moved_interactions', v_moved_interactions,
    'moved_pending_items', v_moved_pending,
    'moved_beneficiaries', v_moved_beneficiaries,
    'moved_payments', v_moved_payments
  );
END;
$$;
