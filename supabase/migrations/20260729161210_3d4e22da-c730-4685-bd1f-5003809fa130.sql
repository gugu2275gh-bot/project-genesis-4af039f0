
DO $$
DECLARE v_flow uuid;
BEGIN
  DELETE FROM public.ai_agent_flow_steps WHERE flow_id IN (SELECT id FROM public.ai_agent_flows WHERE name = 'Pre-Hands off G');
  DELETE FROM public.ai_agent_flows WHERE name = 'Pre-Hands off G';

  INSERT INTO public.ai_agent_flows (name, description, status, phase, intake_config)
  VALUES (
    'Pre-Hands off G',
    'Pré-handoff conversacional: aproveita a primeira mensagem, exige nome, data de nascimento (DD/MM/AAAA) e país de residência, resolve o serviço no catálogo e transfere para humano.',
    'ATIVO',
    'PRE_HANDOFF',
    jsonb_build_object(
      'enabled', true,
      'min_confidence', 0.7,
      'fields', jsonb_build_array('contact.full_name','contact.birth_date','contact.residence_country','funnel.location_known','funnel.interest_confirmed','lead.service_interest','outside.age','contact.email'),
      'greeting_default', jsonb_build_object(
        'pt-BR','Olá! 😊 Eu sou a assistente virtual da CB Asesoria.',
        'es','¡Hola! 😊 Soy la asistente virtual de CB Asesoria.',
        'en','Hello! 😊 I am CB Asesoria''s virtual assistant.',
        'fr','Bonjour ! 😊 Je suis l''assistante virtuelle de CB Asesoria.'),
      'greeting_personalized', jsonb_build_object(
        'pt-BR','Olá, {nome}! 😊 Eu sou a assistente virtual da CB Asesoria. {resumo}',
        'es','¡Hola, {nome}! 😊 Soy la asistente virtual de CB Asesoria. {resumo}',
        'en','Hi, {nome}! 😊 I am CB Asesoria''s virtual assistant. {resumo}',
        'fr','Bonjour, {nome} ! 😊 Je suis l''assistante virtuelle de CB Asesoria. {resumo}'),
      'ack_message', jsonb_build_object(
        'pt-BR','Perfeito, obrigada!','es','¡Perfecto, gracias!','en','Perfect, thank you!','fr','Parfait, merci !')
    )
  ) RETURNING id INTO v_flow;

  INSERT INTO public.ai_agent_flow_steps
    (flow_id, step_code, name, description, phase, answer_type, messages, next_step_code, order_index, handoff, allow_free_answer, allow_parallel_question, validation)
  VALUES
  (v_flow, 'dados_pessoais', 'Pergunta geral: dados pessoais',
   'Nome, data de nascimento (DD/MM/AAAA) e país onde mora.', 'PRE_HANDOFF', 'TEXTO_LIVRE',
   jsonb_build_object(
     'pt-BR', jsonb_build_array('Para entender seu caso, me conte um pouco sobre você: seu nome, sua data de nascimento (DD/MM/AAAA) e em que país você mora hoje.'),
     'es', jsonb_build_array('Para entender tu caso, cuéntame un poco sobre ti: tu nombre, tu fecha de nacimiento (DD/MM/AAAA) y en qué país vives actualmente.'),
     'en', jsonb_build_array('To understand your case, tell me a bit about yourself: your name, your date of birth (DD/MM/YYYY) and which country you live in right now.'),
     'fr', jsonb_build_array('Pour comprendre votre situation, parlez-moi un peu de vous : votre nom, votre date de naissance (JJ/MM/AAAA) et dans quel pays vous habitez actuellement.')),
   'objetivo', 1, false, true, true,
   jsonb_build_object(
     'step_kind','PERGUNTA_GERAL','format','NENHUM','required',true,'max_reasks',1,'ack_enabled',false,
     'skip_mode','NUNCA','options', jsonb_build_array(),
     'unexpected_answer', jsonb_build_object('mode','ACEITAR_APROXIMADO','max_reasks',1),
     'general_capture', jsonb_build_object(
       'enabled', true, 'min_confidence', 0.7, 'min_fields', 3,
       'fields', jsonb_build_array(
         jsonb_build_object('source','full_name','target_field','contact.full_name','required',true,'prompts',
           jsonb_build_object('pt-BR','Como você se chama?','es','¿Cómo te llamas?','en','What is your name?','fr','Comment vous appelez-vous ?')),
         jsonb_build_object('source','birth_date','target_field','contact.birth_date','required',true,'prompts',
           jsonb_build_object(
             'pt-BR','Qual é a sua data de nascimento? Por favor, no formato DD/MM/AAAA (exemplo: 05/03/1990).',
             'es','¿Cuál es tu fecha de nacimiento? Por favor, en el formato DD/MM/AAAA (ejemplo: 05/03/1990).',
             'en','What is your date of birth? Please use the DD/MM/YYYY format (example: 05/03/1990).',
             'fr','Quelle est votre date de naissance ? Merci d''utiliser le format JJ/MM/AAAA (exemple : 05/03/1990).')),
         jsonb_build_object('source','residence_country','target_field','contact.residence_country','required',true,'prompts',
           jsonb_build_object('pt-BR','Em que país você mora hoje?','es','¿En qué país vives actualmente?','en','Which country do you live in right now?','fr','Dans quel pays habitez-vous actuellement ?')),
         jsonb_build_object('source','in_spain','target_field','funnel.location_known','required',false),
         jsonb_build_object('source','email','target_field','contact.email','required',false)
       ))
   )),
  (v_flow, 'objetivo', 'Pergunta geral: objetivo / serviço',
   'Objetivo na Espanha, casado com o catálogo de serviços ativos.', 'PRE_HANDOFF', 'TEXTO_LIVRE',
   jsonb_build_object(
     'pt-BR', jsonb_build_array('E qual é o seu objetivo aqui na Espanha? (por exemplo: estudar, trabalhar, residência, reagrupamento familiar, nacionalidade)'),
     'es', jsonb_build_array('¿Y cuál es tu objetivo aquí en España? (por ejemplo: estudiar, trabajar, residencia, reagrupación familiar, nacionalidad)'),
     'en', jsonb_build_array('And what is your goal here in Spain? (for example: studying, working, residence, family reunification, citizenship)'),
     'fr', jsonb_build_array('Et quel est votre objectif ici en Espagne ? (par exemple : étudier, travailler, résidence, regroupement familial, nationalité)')),
   'transferencia', 2, false, true, true,
   jsonb_build_object(
     'step_kind','PERGUNTA_GERAL','format','NENHUM','required',true,'max_reasks',1,'ack_enabled',false,
     'skip_mode','NUNCA','options', jsonb_build_array(),
     'unexpected_answer', jsonb_build_object('mode','ACEITAR_APROXIMADO','max_reasks',1),
     'general_capture', jsonb_build_object(
       'enabled', true, 'min_confidence', 0.7, 'min_fields', 1,
       'fields', jsonb_build_array(
         jsonb_build_object('source','intent','target_field','funnel.interest_confirmed','required',true,'prompts',
           jsonb_build_object('pt-BR','E qual é o seu objetivo aqui na Espanha?','es','¿Y cuál es tu objetivo aquí en España?','en','And what is your goal here in Spain?','fr','Et quel est votre objectif ici en Espagne ?'))
       ))
   )),
  (v_flow, 'transferencia', 'Transferência para especialista',
   'Encerra o pré-handoff e encaminha para atendimento humano.', 'PRE_HANDOFF', 'NENHUM',
   jsonb_build_object(
     'pt-BR', jsonb_build_array('Obrigada, {nome}! Já tenho as informações necessárias. Vou te encaminhar agora para um especialista da CB Asesoria. 😊'),
     'es', jsonb_build_array('¡Gracias, {nome}! Ya tengo la información necesaria. Te paso ahora con un especialista de CB Asesoria. 😊'),
     'en', jsonb_build_array('Thank you, {nome}! I have the information I need. I am transferring you to a CB Asesoria specialist now. 😊'),
     'fr', jsonb_build_array('Merci, {nome} ! J''ai les informations nécessaires. Je vous transfère maintenant à un spécialiste de CB Asesoria. 😊')),
   NULL, 3, true, false, false,
   jsonb_build_object('step_kind','FIM','format','NENHUM','required',false,'options', jsonb_build_array(),'ack_enabled',false)
  );
END $$;
