
CREATE OR REPLACE FUNCTION public.merge_contacts(p_source_contact_id uuid, p_target_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source contacts%ROWTYPE;
  v_target contacts%ROWTYPE;
BEGIN
  -- Get source and target
  SELECT * INTO v_source FROM contacts WHERE id = p_source_contact_id;
  SELECT * INTO v_target FROM contacts WHERE id = p_target_contact_id;

  IF v_source IS NULL OR v_target IS NULL THEN
    RAISE EXCEPTION 'Contato de origem ou destino não encontrado';
  END IF;

  -- Fill empty fields on target with source data
  UPDATE contacts SET
    phone = COALESCE(v_target.phone, v_source.phone),
    email = COALESCE(v_target.email, v_source.email),
    nationality = COALESCE(v_target.nationality, v_source.nationality),
    address = COALESCE(v_target.address, v_source.address),
    birth_date = COALESCE(v_target.birth_date, v_source.birth_date),
    birth_city = COALESCE(v_target.birth_city, v_source.birth_city),
    birth_state = COALESCE(v_target.birth_state, v_source.birth_state),
    civil_status = COALESCE(v_target.civil_status, v_source.civil_status),
    profession = COALESCE(v_target.profession, v_source.profession),
    document_type = COALESCE(v_target.document_type, v_source.document_type),
    document_number = COALESCE(v_target.document_number, v_source.document_number),
    document_expiry_date = COALESCE(v_target.document_expiry_date, v_source.document_expiry_date),
    second_document_type = COALESCE(v_target.second_document_type, v_source.second_document_type),
    second_document_number = COALESCE(v_target.second_document_number, v_source.second_document_number),
    cpf = COALESCE(v_target.cpf, v_source.cpf),
    country_of_origin = COALESCE(v_target.country_of_origin, v_source.country_of_origin),
    mother_name = COALESCE(v_target.mother_name, v_source.mother_name),
    father_name = COALESCE(v_target.father_name, v_source.father_name),
    origin_channel = COALESCE(v_target.origin_channel, v_source.origin_channel),
    preferred_language = COALESCE(v_target.preferred_language, v_source.preferred_language),
    spain_arrival_date = COALESCE(v_target.spain_arrival_date, v_source.spain_arrival_date),
    monthly_income = COALESCE(v_target.monthly_income, v_source.monthly_income),
    education_level = COALESCE(v_target.education_level, v_source.education_level),
    empadronamiento_address = COALESCE(v_target.empadronamiento_address, v_source.empadronamiento_address),
    empadronamiento_city = COALESCE(v_target.empadronamiento_city, v_source.empadronamiento_city),
    empadronamiento_since = COALESCE(v_target.empadronamiento_since, v_source.empadronamiento_since),
    payment_notes = COALESCE(v_target.payment_notes, v_source.payment_notes),
    referral_name = COALESCE(v_target.referral_name, v_source.referral_name),
    legal_guardian_name = COALESCE(v_target.legal_guardian_name, v_source.legal_guardian_name),
    legal_guardian_phone = COALESCE(v_target.legal_guardian_phone, v_source.legal_guardian_phone),
    legal_guardian_email = COALESCE(v_target.legal_guardian_email, v_source.legal_guardian_email),
    legal_guardian_relationship = COALESCE(v_target.legal_guardian_relationship, v_source.legal_guardian_relationship),
    legal_guardian_birth_date = COALESCE(v_target.legal_guardian_birth_date, v_source.legal_guardian_birth_date),
    legal_guardian_address = COALESCE(v_target.legal_guardian_address, v_source.legal_guardian_address),
    updated_at = now()
  WHERE id = p_target_contact_id;

  -- Transfer leads
  UPDATE leads SET contact_id = p_target_contact_id WHERE contact_id = p_source_contact_id;

  -- Transfer interactions
  UPDATE interactions SET contact_id = p_target_contact_id WHERE contact_id = p_source_contact_id;

  -- Transfer contract beneficiaries
  UPDATE contract_beneficiaries SET contact_id = p_target_contact_id WHERE contact_id = p_source_contact_id;

  -- Transfer beneficiary_titular_links (handle duplicates)
  -- Delete links from source that would conflict with existing links on target
  DELETE FROM beneficiary_titular_links
  WHERE beneficiary_contact_id = p_source_contact_id
    AND titular_contact_id IN (
      SELECT titular_contact_id FROM beneficiary_titular_links WHERE beneficiary_contact_id = p_target_contact_id
    );
  DELETE FROM beneficiary_titular_links
  WHERE titular_contact_id = p_source_contact_id
    AND beneficiary_contact_id IN (
      SELECT beneficiary_contact_id FROM beneficiary_titular_links WHERE titular_contact_id = p_target_contact_id
    );
  -- Also remove self-referencing links that would result from the merge
  DELETE FROM beneficiary_titular_links
  WHERE (beneficiary_contact_id = p_source_contact_id AND titular_contact_id = p_target_contact_id)
     OR (titular_contact_id = p_source_contact_id AND beneficiary_contact_id = p_target_contact_id);

  -- Now transfer remaining links
  UPDATE beneficiary_titular_links SET beneficiary_contact_id = p_target_contact_id WHERE beneficiary_contact_id = p_source_contact_id;
  UPDATE beneficiary_titular_links SET titular_contact_id = p_target_contact_id WHERE titular_contact_id = p_source_contact_id;

  -- Transfer contact_data_suggestions
  UPDATE contact_data_suggestions SET contact_id = p_target_contact_id WHERE contact_id = p_source_contact_id;

  -- Transfer customer_chat_context (delete source if target exists)
  IF EXISTS (SELECT 1 FROM customer_chat_context WHERE contact_id = p_target_contact_id) THEN
    DELETE FROM customer_chat_context WHERE contact_id = p_source_contact_id;
  ELSE
    UPDATE customer_chat_context SET contact_id = p_target_contact_id WHERE contact_id = p_source_contact_id;
  END IF;

  -- Transfer customer_sector_pending_items
  UPDATE customer_sector_pending_items SET contact_id = p_target_contact_id WHERE contact_id = p_source_contact_id;

  -- Transfer chat_routing_logs
  UPDATE chat_routing_logs SET contact_id = p_target_contact_id WHERE contact_id = p_source_contact_id;

  -- Transfer linked_principal_contact_id references
  UPDATE contacts SET linked_principal_contact_id = p_target_contact_id WHERE linked_principal_contact_id = p_source_contact_id;

  -- Delete source contact
  DELETE FROM contacts WHERE id = p_source_contact_id;
END;
$$;
