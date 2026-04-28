CREATE OR REPLACE FUNCTION public.merge_contacts(
  p_source_contact_id uuid,
  p_target_contact_id uuid,
  p_update_phone boolean DEFAULT false,
  p_update_email boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_moved_suggestions int := 0;
  v_protected_contracts int := 0;
BEGIN
  SELECT * INTO v_source FROM contacts WHERE id = p_source_contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contato de origem não encontrado'; END IF;

  SELECT * INTO v_target FROM contacts WHERE id = p_target_contact_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contato de destino não encontrado'; END IF;

  IF p_source_contact_id = p_target_contact_id THEN
    RAISE EXCEPTION 'Não é possível mesclar um contato consigo mesmo';
  END IF;

  -- Conta contratos protegidos (APROVADO/ASSINADO/REPROVADO) ANTES de mover
  SELECT COUNT(DISTINCT c.id) INTO v_protected_contracts
  FROM contracts c
  WHERE c.status IN ('APROVADO', 'ASSINADO', 'REPROVADO')
    AND (
      EXISTS (SELECT 1 FROM contract_beneficiaries cb WHERE cb.contract_id = c.id AND cb.contact_id = p_source_contact_id)
      OR EXISTS (SELECT 1 FROM payments p WHERE p.contract_id = c.id AND p.beneficiary_contact_id = p_source_contact_id)
    );

  UPDATE leads SET contact_id = p_target_contact_id WHERE contact_id = p_source_contact_id;
  GET DIAGNOSTICS v_moved_leads = ROW_COUNT;

  UPDATE interactions SET contact_id = p_target_contact_id WHERE contact_id = p_source_contact_id;
  GET DIAGNOSTICS v_moved_interactions = ROW_COUNT;

  UPDATE customer_sector_pending_items SET contact_id = p_target_contact_id WHERE contact_id = p_source_contact_id;
  GET DIAGNOSTICS v_moved_pending = ROW_COUNT;

  DELETE FROM customer_chat_context WHERE contact_id = p_source_contact_id;

  -- Apenas mescla beneficiários cujos contratos NÃO estão em estado finalizado/cancelado
  UPDATE contract_beneficiaries cb
    SET contact_id = p_target_contact_id
  WHERE cb.contact_id = p_source_contact_id
    AND NOT EXISTS (
      SELECT 1 FROM contracts c
      WHERE c.id = cb.contract_id
        AND c.status IN ('APROVADO', 'ASSINADO', 'REPROVADO')
    );
  GET DIAGNOSTICS v_moved_beneficiaries = ROW_COUNT;

  -- Apenas atualiza payments cujos contratos NÃO estão em estado finalizado/cancelado
  UPDATE payments p
    SET beneficiary_contact_id = p_target_contact_id
  WHERE p.beneficiary_contact_id = p_source_contact_id
    AND NOT EXISTS (
      SELECT 1 FROM contracts c
      WHERE c.id = p.contract_id
        AND c.status IN ('APROVADO', 'ASSINADO', 'REPROVADO')
    );
  GET DIAGNOSTICS v_moved_payments = ROW_COUNT;

  UPDATE chat_routing_logs SET contact_id = p_target_contact_id WHERE contact_id = p_source_contact_id;
  GET DIAGNOSTICS v_moved_routing = ROW_COUNT;

  UPDATE reactivation_resolutions SET contact_id = p_target_contact_id WHERE contact_id = p_source_contact_id;
  GET DIAGNOSTICS v_moved_reactivations = ROW_COUNT;

  UPDATE contact_data_suggestions SET contact_id = p_target_contact_id WHERE contact_id = p_source_contact_id;
  GET DIAGNOSTICS v_moved_suggestions = ROW_COUNT;

  WITH remapped_links AS (
    SELECT
      CASE
        WHEN beneficiary_contact_id = p_source_contact_id THEN p_target_contact_id
        ELSE beneficiary_contact_id
      END AS beneficiary_contact_id,
      CASE
        WHEN titular_contact_id = p_source_contact_id THEN p_target_contact_id
        ELSE titular_contact_id
      END AS titular_contact_id,
      MIN(created_at) AS created_at
    FROM beneficiary_titular_links
    WHERE beneficiary_contact_id = p_source_contact_id
       OR titular_contact_id = p_source_contact_id
    GROUP BY 1, 2
  ),
  deleted_links AS (
    DELETE FROM beneficiary_titular_links
    WHERE beneficiary_contact_id = p_source_contact_id
       OR titular_contact_id = p_source_contact_id
    RETURNING 1
  )
  INSERT INTO beneficiary_titular_links (
    beneficiary_contact_id,
    titular_contact_id,
    created_at
  )
  SELECT
    rl.beneficiary_contact_id,
    rl.titular_contact_id,
    COALESCE(rl.created_at, now())
  FROM remapped_links rl
  CROSS JOIN (SELECT COUNT(*) FROM deleted_links) dl
  WHERE rl.beneficiary_contact_id <> rl.titular_contact_id
  ON CONFLICT (beneficiary_contact_id, titular_contact_id) DO NOTHING;

  UPDATE contacts SET linked_principal_contact_id = p_target_contact_id
  WHERE linked_principal_contact_id = p_source_contact_id;

  UPDATE contacts SET
    phone = COALESCE(NULLIF(phone, ''), v_source.phone),
    email = COALESCE(NULLIF(email, ''), v_source.email),
    nationality = COALESCE(nationality, v_source.nationality),
    country_of_origin = COALESCE(country_of_origin, v_source.country_of_origin),
    birth_date = COALESCE(birth_date, v_source.birth_date),
    birth_city = COALESCE(birth_city, v_source.birth_city),
    birth_state = COALESCE(birth_state, v_source.birth_state),
    address = COALESCE(NULLIF(address, ''), v_source.address),
    document_type = COALESCE(document_type, v_source.document_type),
    document_number = COALESCE(NULLIF(document_number, ''), v_source.document_number),
    document_expiry_date = COALESCE(document_expiry_date, v_source.document_expiry_date),
    second_document_type = COALESCE(second_document_type, v_source.second_document_type),
    second_document_number = COALESCE(NULLIF(second_document_number, ''), v_source.second_document_number),
    cpf = COALESCE(NULLIF(cpf, ''), v_source.cpf),
    civil_status = COALESCE(civil_status, v_source.civil_status),
    profession = COALESCE(NULLIF(profession, ''), v_source.profession),
    education_level = COALESCE(education_level, v_source.education_level),
    father_name = COALESCE(NULLIF(father_name, ''), v_source.father_name),
    mother_name = COALESCE(NULLIF(mother_name, ''), v_source.mother_name),
    spain_arrival_date = COALESCE(spain_arrival_date, v_source.spain_arrival_date),
    empadronamiento_address = COALESCE(NULLIF(empadronamiento_address, ''), v_source.empadronamiento_address),
    empadronamiento_city = COALESCE(NULLIF(empadronamiento_city, ''), v_source.empadronamiento_city),
    empadronamiento_since = COALESCE(empadronamiento_since, v_source.empadronamiento_since),
    is_empadronado = COALESCE(is_empadronado, v_source.is_empadronado),
    monthly_income = COALESCE(monthly_income, v_source.monthly_income),
    has_job_offer = COALESCE(has_job_offer, v_source.has_job_offer),
    has_eu_family_member = COALESCE(has_eu_family_member, v_source.has_eu_family_member),
    eu_entry_last_6_months = COALESCE(eu_entry_last_6_months, v_source.eu_entry_last_6_months),
    eu_entry_location = COALESCE(NULLIF(eu_entry_location, ''), v_source.eu_entry_location),
    expulsion_history = COALESCE(expulsion_history, v_source.expulsion_history),
    works_remotely = COALESCE(works_remotely, v_source.works_remotely),
    has_admin_marketing_experience = COALESCE(has_admin_marketing_experience, v_source.has_admin_marketing_experience),
    previous_official_relationship = COALESCE(previous_official_relationship, v_source.previous_official_relationship),
    referral_name = COALESCE(NULLIF(referral_name, ''), v_source.referral_name),
    referral_confirmed = COALESCE(referral_confirmed, v_source.referral_confirmed),
    legal_guardian_name = COALESCE(NULLIF(legal_guardian_name, ''), v_source.legal_guardian_name),
    legal_guardian_phone = COALESCE(NULLIF(legal_guardian_phone, ''), v_source.legal_guardian_phone),
    legal_guardian_email = COALESCE(NULLIF(legal_guardian_email, ''), v_source.legal_guardian_email),
    legal_guardian_birth_date = COALESCE(legal_guardian_birth_date, v_source.legal_guardian_birth_date),
    legal_guardian_address = COALESCE(NULLIF(legal_guardian_address, ''), v_source.legal_guardian_address),
    legal_guardian_relationship = COALESCE(NULLIF(legal_guardian_relationship, ''), v_source.legal_guardian_relationship),
    payment_notes = CASE
      WHEN v_source.payment_notes IS NOT NULL AND v_source.payment_notes <> ''
      THEN COALESCE(payment_notes, '') || E'\n---\n' || v_source.payment_notes
      ELSE payment_notes
    END
  WHERE id = p_target_contact_id;

  INSERT INTO audit_logs (user_id, table_name, record_id, action, old_data, new_data)
  VALUES (
    auth.uid(), 'contacts', p_target_contact_id::text, 'MERGE',
    jsonb_build_object('source_contact_id', p_source_contact_id, 'source_name', v_source.full_name, 'source_phone', v_source.phone),
    jsonb_build_object(
      'moved_leads', v_moved_leads, 'moved_interactions', v_moved_interactions,
      'moved_pending_items', v_moved_pending, 'moved_beneficiaries', v_moved_beneficiaries,
      'moved_payments', v_moved_payments, 'moved_suggestions', v_moved_suggestions,
      'protected_contracts', v_protected_contracts
    )
  );

  -- Se houver contratos protegidos, NÃO deletar o contato de origem (ele ainda é referenciado)
  IF v_protected_contracts = 0 THEN
    DELETE FROM contacts WHERE id = p_source_contact_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'source_deleted', CASE WHEN v_protected_contracts = 0 THEN v_source.full_name ELSE NULL END,
    'source_preserved', v_protected_contracts > 0,
    'protected_contracts', v_protected_contracts,
    'target_id', p_target_contact_id,
    'moved_leads', v_moved_leads,
    'moved_interactions', v_moved_interactions,
    'moved_pending_items', v_moved_pending,
    'moved_beneficiaries', v_moved_beneficiaries,
    'moved_payments', v_moved_payments,
    'moved_suggestions', v_moved_suggestions
  );
END;
$function$;