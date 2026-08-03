
DO $mig$
DECLARE
  v_flow_id uuid;
BEGIN
  SELECT id INTO v_flow_id FROM public.ai_agent_flows WHERE name = 'Pre-hands-off-g-v2';

  IF v_flow_id IS NULL THEN
    INSERT INTO public.ai_agent_flows (name, description, status, phase)
    VALUES ('Pre-hands-off-g-v2', 'Pre-handoff v2: nome primeiro, depois dados pessoais, objetivo/serviço e transferência.', 'RASCUNHO', 'PRE_HANDOFF')
    RETURNING id INTO v_flow_id;
  END IF;

  UPDATE public.ai_agent_flows
  SET intake_config = jsonb_build_object(
        'enabled', true,
        'min_confidence', 0.7,
        'fields', jsonb_build_array(
          'contact.full_name','contact.birth_date','contact.residence_country',
          'contact.education_level','contact.has_eu_family_member','contact.eu_entry_last_6_months',
          'funnel.interest_confirmed','lead.service_interest'
        ),
        'greeting_default', jsonb_build_object(
          'pt-BR','Olá! Eu sou a assistente virtual da CB ASESORIA. 😊',
          'es','¡Hola! Soy la asistente virtual de CB ASESORIA. 😊',
          'en','Hello! I am the virtual assistant of CB ASESORIA. 😊',
          'fr','Bonjour ! Je suis l''assistante virtuelle de CB ASESORIA. 😊'
        ),
        'greeting_personalized', jsonb_build_object(
          'pt-BR','Olá, {nome}! Eu sou a assistente virtual da CB ASESORIA. 😊',
          'es','¡Hola, {nome}! Soy la asistente virtual de CB ASESORIA. 😊',
          'en','Hello, {nome}! I am the virtual assistant of CB ASESORIA. 😊',
          'fr','Bonjour, {nome} ! Je suis l''assistante virtuelle de CB ASESORIA. 😊'
        ),
        'ack_message', jsonb_build_object(
          'pt-BR','Perfeito, obrigada!','es','¡Perfecto, gracias!','en','Perfect, thank you!','fr','Parfait, merci !'
        )
      ),
      description = 'Pre-handoff v2: nome primeiro, depois dados pessoais, objetivo/serviço e transferência.',
      updated_at = now()
  WHERE id = v_flow_id;

  DELETE FROM public.ai_agent_flow_steps WHERE flow_id = v_flow_id;

  -- 1) NOME
  INSERT INTO public.ai_agent_flow_steps
    (flow_id, step_code, name, description, message, answer_type, next_step_code, handoff, order_index, phase, messages, reask_messages, validation)
  VALUES (
    v_flow_id, 'nome', 'Pergunta geral: nome', 'Coleta o nome informado pelo próprio cliente. Nada avança sem o nome.',
    '', 'TEXTO_LIVRE', 'dados_pessoais', false, 1, 'PRE_HANDOFF',
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Olá! Eu sou a assistente virtual da CB ASESORIA. 😊 Qual o seu nome?'),
      'es', jsonb_build_array('¡Hola! Soy la asistente virtual de CB ASESORIA. 😊 ¿Cuál es tu nombre?'),
      'en', jsonb_build_array('Hello! I am the virtual assistant of CB ASESORIA. 😊 What is your name?'),
      'fr', jsonb_build_array('Bonjour ! Je suis l''assistante virtuelle de CB ASESORIA. 😊 Quel est votre nom ?')
    ),
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Não consegui identificar o seu nome. Poderia informá-lo novamente, por favor?'),
      'es', jsonb_build_array('No he podido identificar tu nombre. ¿Podrías indicármelo de nuevo, por favor?'),
      'en', jsonb_build_array('I could not identify your name. Could you tell me again, please?'),
      'fr', jsonb_build_array('Je n''ai pas réussi à identifier votre nom. Pourriez-vous me l''indiquer à nouveau, s''il vous plaît ?')
    ),
    jsonb_build_object(
      'format','NENHUM','options', jsonb_build_array(), 'required', true,
      'skip_mode','NUNCA','step_kind','PERGUNTA_GERAL','max_reasks', 2, 'ack_enabled', false,
      'general_capture', jsonb_build_object(
        'enabled', true, 'min_fields', 1, 'min_confidence', 0.7,
        'fields', jsonb_build_array(
          jsonb_build_object('source','full_name','target_field','contact.full_name','required', true,
            'prompts', jsonb_build_object(
              'pt-BR','Qual o seu nome?','es','¿Cuál es tu nombre?','en','What is your name?','fr','Quel est votre nom ?'))
        )
      ),
      'unexpected_answer', jsonb_build_object('mode','INSISTIR','max_reasks', 2)
    )
  );

  -- 2) DADOS PESSOAIS
  INSERT INTO public.ai_agent_flow_steps
    (flow_id, step_code, name, description, message, answer_type, next_step_code, handoff, order_index, phase, messages, reask_messages, validation)
  VALUES (
    v_flow_id, 'dados_pessoais', 'Pergunta geral: dados pessoais', 'Data de nascimento, país de residência, formação superior, familiar europeu e Europa nos últimos 6 meses.',
    '', 'TEXTO_LIVRE', 'objetivo', false, 2, 'PRE_HANDOFF',
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Perfeito, {nome}! Para entender melhor o seu caso, farei algumas perguntas… me comente um pouco sobre você (data de nascimento, em qual país você mora, se possui formação superior, se possui algum familiar europeu, se esteve na Europa nos últimos 6 meses).'),
      'es', jsonb_build_array('¡Perfecto, {nome}! Para entender mejor tu caso, te haré algunas preguntas… cuéntame un poco sobre ti (fecha de nacimiento, en qué país vives, si tienes formación universitaria, si tienes algún familiar europeo, si has estado en Europa en los últimos 6 meses).'),
      'en', jsonb_build_array('Perfect, {nome}! To better understand your case, I will ask you a few questions… tell me a bit about yourself (date of birth, which country you live in, whether you have a university degree, whether you have any European relative, whether you have been in Europe in the last 6 months).'),
      'fr', jsonb_build_array('Parfait, {nome} ! Pour mieux comprendre votre situation, je vais vous poser quelques questions… parlez-moi un peu de vous (date de naissance, dans quel pays vous habitez, si vous avez un diplôme universitaire, si vous avez un membre de votre famille européen, si vous avez été en Europe ces 6 derniers mois).')
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'format','NENHUM','options', jsonb_build_array(), 'required', true,
      'skip_mode','NUNCA','step_kind','PERGUNTA_GERAL','max_reasks', 2, 'ack_enabled', false,
      'general_capture', jsonb_build_object(
        'enabled', true, 'min_fields', 5, 'min_confidence', 0.7,
        'fields', jsonb_build_array(
          jsonb_build_object('source','birth_date','target_field','contact.birth_date','required', true,
            'prompts', jsonb_build_object(
              'pt-BR','Qual é a sua data de nascimento? Por favor, no formato DD/MM/AAAA (exemplo: 05/03/1990).',
              'es','¿Cuál es tu fecha de nacimiento? Por favor, en el formato DD/MM/AAAA (ejemplo: 05/03/1990).',
              'en','What is your date of birth? Please use the DD/MM/YYYY format (example: 05/03/1990).',
              'fr','Quelle est votre date de naissance ? Merci d''utiliser le format JJ/MM/AAAA (exemple : 05/03/1990).')),
          jsonb_build_object('source','residence_country','target_field','contact.residence_country','required', true,
            'prompts', jsonb_build_object(
              'pt-BR','Em qual país você mora atualmente?','es','¿En qué país vives actualmente?',
              'en','Which country do you live in right now?','fr','Dans quel pays habitez-vous actuellement ?')),
          jsonb_build_object('source','education_superior','target_field','contact.education_level','required', true,
            'prompts', jsonb_build_object(
              'pt-BR','Você possui formação superior (faculdade/universidade)?','es','¿Tienes formación superior (universitaria)?',
              'en','Do you have a university degree?','fr','Avez-vous une formation universitaire ?')),
          jsonb_build_object('source','eu_family','target_field','contact.has_eu_family_member','required', true,
            'prompts', jsonb_build_object(
              'pt-BR','Você possui algum familiar europeu?','es','¿Tienes algún familiar europeo?',
              'en','Do you have any European relative?','fr','Avez-vous un membre de votre famille européen ?')),
          jsonb_build_object('source','europe_6m','target_field','contact.eu_entry_last_6_months','required', true,
            'prompts', jsonb_build_object(
              'pt-BR','Você esteve na Europa nos últimos 6 meses?','es','¿Has estado en Europa en los últimos 6 meses?',
              'en','Have you been in Europe in the last 6 months?','fr','Avez-vous été en Europe ces 6 derniers mois ?'))
        )
      ),
      'unexpected_answer', jsonb_build_object('mode','INSISTIR','max_reasks', 2)
    )
  );

  -- 3) OBJETIVO / SERVIÇO
  INSERT INTO public.ai_agent_flow_steps
    (flow_id, step_code, name, description, message, answer_type, next_step_code, handoff, order_index, phase, messages, reask_messages, validation)
  VALUES (
    v_flow_id, 'objetivo', 'Pergunta geral: objetivo / serviço', 'Identifica o objetivo na Espanha e o serviço correspondente no catálogo ativo.',
    '', 'TEXTO_LIVRE', 'transferencia', false, 3, 'PRE_HANDOFF',
    jsonb_build_object(
      'pt-BR', jsonb_build_array('E qual é o seu objetivo aqui na Espanha?
(visto de estudos, residência para nômades digitais, arraigos, nacionalidade espanhola, oferta de trabalho ou outro)'),
      'es', jsonb_build_array('¿Y cuál es tu objetivo aquí en España?
(visado de estudios, residencia para nómadas digitales, arraigos, nacionalidad española, oferta de trabajo u otro)'),
      'en', jsonb_build_array('And what is your goal here in Spain?
(student visa, digital nomad residence, arraigo, Spanish citizenship, job offer or other)'),
      'fr', jsonb_build_array('Et quel est votre objectif ici en Espagne ?
(visa étudiant, résidence pour nomades numériques, arraigo, nationalité espagnole, offre d''emploi ou autre)')
    ),
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Só para eu direcionar corretamente: pode me explicar com suas palavras o que você deseja resolver aqui na Espanha?'),
      'es', jsonb_build_array('Solo para dirigirte correctamente: ¿puedes explicarme con tus palabras qué deseas resolver aquí en España?'),
      'en', jsonb_build_array('Just so I can direct you correctly: could you explain in your own words what you want to solve here in Spain?'),
      'fr', jsonb_build_array('Juste pour bien vous orienter : pouvez-vous m''expliquer avec vos mots ce que vous souhaitez résoudre en Espagne ?')
    ),
    jsonb_build_object(
      'format','NENHUM','options', jsonb_build_array(), 'required', true,
      'skip_mode','NUNCA','step_kind','PERGUNTA_GERAL','max_reasks', 2, 'ack_enabled', false,
      'general_capture', jsonb_build_object(
        'enabled', true, 'min_fields', 1, 'min_confidence', 0.7,
        'fields', jsonb_build_array(
          jsonb_build_object('source','intent','target_field','funnel.interest_confirmed','required', true,
            'prompts', jsonb_build_object(
              'pt-BR','E qual é o seu objetivo aqui na Espanha? (visto de estudos, residência para nômades digitais, arraigos, nacionalidade espanhola, oferta de trabalho ou outro)',
              'es','¿Y cuál es tu objetivo aquí en España? (visado de estudios, residencia para nómadas digitales, arraigos, nacionalidad española, oferta de trabajo u otro)',
              'en','And what is your goal here in Spain? (student visa, digital nomad residence, arraigo, Spanish citizenship, job offer or other)',
              'fr','Et quel est votre objectif ici en Espagne ? (visa étudiant, résidence pour nomades numériques, arraigo, nationalité espagnole, offre d''emploi ou autre)'))
        )
      ),
      'unexpected_answer', jsonb_build_object('mode','INSISTIR','max_reasks', 2)
    )
  );

  -- 4) TRANSFERÊNCIA
  INSERT INTO public.ai_agent_flow_steps
    (flow_id, step_code, name, description, message, answer_type, next_step_code, handoff, order_index, phase, messages, reask_messages, validation)
  VALUES (
    v_flow_id, 'transferencia', 'Transferência para especialista', 'Encerra o pré-handoff e transfere para o atendimento humano.',
    '', 'NENHUM', NULL, true, 4, 'PRE_HANDOFF',
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Perfeito, {nome}. Obrigada pelas informações. Já reuni os dados iniciais e vou transferir você para um especialista da CB Asesoría, que dará continuidade ao seu atendimento. Por favor, aguarde um momento.'),
      'es', jsonb_build_array('Perfecto, {nome}. Gracias por la información. Ya he reunido los datos iniciales y te transferiré a un especialista de CB Asesoría, que continuará con tu atención. Por favor, espera un momento.'),
      'en', jsonb_build_array('Perfect, {nome}. Thank you for the information. I have gathered the initial data and will transfer you to a CB Asesoría specialist, who will continue your service. Please wait a moment.'),
      'fr', jsonb_build_array('Parfait, {nome}. Merci pour ces informations. J''ai réuni les données initiales et je vais vous transférer à un spécialiste de CB Asesoría, qui poursuivra votre accompagnement. Merci de patienter un instant.')
    ),
    '{}'::jsonb,
    jsonb_build_object('format','NENHUM','options', jsonb_build_array(), 'required', false, 'step_kind','FIM','ack_enabled', false)
  );
END
$mig$;
