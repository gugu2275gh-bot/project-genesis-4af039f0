DO $$
DECLARE v_flow uuid;
DECLARE v_intake jsonb := jsonb_build_object(
  'enabled', true,
  'min_confidence', 0.7,
  'fields', jsonb_build_array('contact.full_name','contact.email','outside.age','funnel.empadronado_city','contact.education_level','contact.has_eu_family_member','contact.eu_entry_last_6_months','funnel.interest_confirmed','lead.service_interest','funnel.location_known'),
  'greeting_default', jsonb_build_object(
    'pt-BR','Olá! Eu sou a assistente virtual da CB ASESORIA. 😊',
    'es','¡Hola! Soy la asistente virtual de CB ASESORIA. 😊',
    'en','Hello! I am CB ASESORIA''s virtual assistant. 😊',
    'fr','Bonjour ! Je suis l''assistante virtuelle de CB ASESORIA. 😊'),
  'greeting_personalized', jsonb_build_object(
    'pt-BR','Olá, {nome}! Eu sou a assistente virtual da CB ASESORIA. 😊 {resumo}',
    'es','¡Hola, {nome}! Soy la asistente virtual de CB ASESORIA. 😊 {resumo}',
    'en','Hi, {nome}! I am CB ASESORIA''s virtual assistant. 😊 {resumo}',
    'fr','Bonjour, {nome} ! Je suis l''assistante virtuelle de CB ASESORIA. 😊 {resumo}'),
  'ack_message', jsonb_build_object('pt-BR','Perfeito, obrigada!','es','¡Perfecto, gracias!','en','Perfect, thank you!','fr','Parfait, merci !')
);
BEGIN
  INSERT INTO public.ai_agent_flows (name, description, status, phase, intake_config)
  VALUES ('Conversa natural',
          'Conversa aberta em 2 perguntas gerais, sem repetir o que o cliente já disse. Campos obrigatórios são perguntados antes da transferência.',
          'RASCUNHO', 'PRE_HANDOFF', v_intake)
  RETURNING id INTO v_flow;

  INSERT INTO public.ai_agent_flow_steps
    (flow_id, step_code, name, message, answer_type, order_index, next_step_code, handoff, messages, validation)
  VALUES
  (v_flow, 'dados_pessoais', 'Pergunta geral: dados pessoais', '', 'TEXTO_LIVRE', 1, 'objetivo', false,
   jsonb_build_object(
     'pt-BR', jsonb_build_array('Olá, {nome}! Eu sou a assistente virtual da CB ASESORIA. 😊' || chr(10) || 'Para entender melhor o seu caso, farei algumas perguntas… me comente um pouco sobre você (idade, onde você mora, possui formação superior, possui algum familiar europeu, esteve na Europa nos últimos 6 meses)'),
     'es', jsonb_build_array('¡Hola, {nome}! Soy la asistente virtual de CB ASESORIA. 😊' || chr(10) || 'Para entender mejor tu caso, te haré algunas preguntas… cuéntame un poco sobre ti (edad, dónde vives, si tienes formación universitaria, si tienes algún familiar europeo, si has estado en Europa en los últimos 6 meses)'),
     'en', jsonb_build_array('Hi, {nome}! I am CB ASESORIA''s virtual assistant. 😊' || chr(10) || 'To understand your case better, I will ask you a few questions… tell me a bit about yourself (age, where you live, whether you have a university degree, whether you have a European relative, whether you have been in Europe in the last 6 months)'),
     'fr', jsonb_build_array('Bonjour, {nome} ! Je suis l''assistante virtuelle de CB ASESORIA. 😊' || chr(10) || 'Pour mieux comprendre votre situation, je vais vous poser quelques questions… parlez-moi un peu de vous (âge, où vous habitez, si vous avez un diplôme universitaire, si vous avez de la famille européenne, si vous avez été en Europe ces 6 derniers mois)')
   ),
   jsonb_build_object(
     'step_kind','PERGUNTA_GERAL','format','NENHUM','required',true,'max_reasks',1,'options', jsonb_build_array(),
     'ack_enabled', false, 'skip_mode','NUNCA',
     'unexpected_answer', jsonb_build_object('mode','ACEITAR_APROXIMADO','max_reasks',1),
     'general_capture', jsonb_build_object(
       'enabled', true, 'min_confidence', 0.7, 'min_fields', 2,
       'fields', jsonb_build_array(
         jsonb_build_object('source','full_name','target_field','contact.full_name','required',true),
         jsonb_build_object('source','age','target_field','outside.age','required',true),
         jsonb_build_object('source','city','target_field','funnel.empadronado_city','required',true),
         jsonb_build_object('source','education_superior','target_field','contact.education_level','required',false),
         jsonb_build_object('source','eu_family','target_field','contact.has_eu_family_member','required',false),
         jsonb_build_object('source','europe_6m','target_field','contact.eu_entry_last_6_months','required',false)
       ))
   )),
  (v_flow, 'objetivo', 'Pergunta geral: objetivo na Espanha', '', 'TEXTO_LIVRE', 2, 'transferencia', false,
   jsonb_build_object(
     'pt-BR', jsonb_build_array('E qual o seu objetivo na Espanha?' || chr(10) || chr(10) || 'Visto de estudos, residência para nômades, arraigos, nacionalidade espanhola, já possui oferta de trabalho ou outros?'),
     'es', jsonb_build_array('¿Y cuál es tu objetivo en España?' || chr(10) || chr(10) || '¿Visado de estudios, residencia para nómadas digitales, arraigos, nacionalidad española, ya tienes una oferta de trabajo u otros?'),
     'en', jsonb_build_array('And what is your goal in Spain?' || chr(10) || chr(10) || 'Student visa, digital nomad residency, arraigo, Spanish nationality, do you already have a job offer, or something else?'),
     'fr', jsonb_build_array('Et quel est votre objectif en Espagne ?' || chr(10) || chr(10) || 'Visa d''études, résidence pour nomades numériques, arraigo, nationalité espagnole, avez-vous déjà une offre d''emploi, ou autre chose ?')
   ),
   jsonb_build_object(
     'step_kind','PERGUNTA_GERAL','format','NENHUM','required',true,'max_reasks',1,'options', jsonb_build_array(),
     'ack_enabled', false, 'skip_mode','NUNCA',
     'unexpected_answer', jsonb_build_object('mode','ACEITAR_APROXIMADO','max_reasks',1),
     'general_capture', jsonb_build_object(
       'enabled', true, 'min_confidence', 0.7, 'min_fields', 1,
       'fields', jsonb_build_array(
         jsonb_build_object('source','intent','target_field','funnel.interest_confirmed','required',true),
         jsonb_build_object('source','in_spain','target_field','funnel.location_known','required',false),
         jsonb_build_object('source','email','target_field','contact.email','required',false)
       ))
   )),
  (v_flow, 'transferencia', 'Transferir para atendente humano', '', 'TEXTO_LIVRE', 3, NULL, true,
   jsonb_build_object(
     'pt-BR', jsonb_build_array('Obrigada, {nome}! Já tenho as informações necessárias. Vou te transferir agora para um dos nossos especialistas. 😊'),
     'es', jsonb_build_array('¡Gracias, {nome}! Ya tengo la información necesaria. Te transfiero ahora con uno de nuestros especialistas. 😊'),
     'en', jsonb_build_array('Thank you, {nome}! I have the information I need. I am transferring you now to one of our specialists. 😊'),
     'fr', jsonb_build_array('Merci, {nome} ! J''ai les informations nécessaires. Je vous transfère maintenant à l''un de nos spécialistes. 😊')
   ),
   jsonb_build_object('step_kind','HANDOFF','format','NENHUM','required',false,'options', jsonb_build_array(),'ack_enabled', false));
END $$;