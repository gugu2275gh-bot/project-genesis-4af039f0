DO $$
DECLARE v_flow uuid;
BEGIN
  SELECT id INTO v_flow FROM public.ai_agent_flows WHERE name = 'Pre-hands-off-g-v3';
  IF v_flow IS NULL THEN
    INSERT INTO public.ai_agent_flows (name, description, status, phase, intake_config)
    VALUES (
      'Pre-hands-off-g-v3',
      'Pré-handoff v3: nome obrigatório, dados pessoais opcionais (uma única pergunta, não bloqueante, sem data de nascimento) e objetivo/serviço obrigatório antes da transferência.',
      'RASCUNHO',
      'PRE_HANDOFF',
      jsonb_build_object(
        'enabled', true,
        'strict_name', true,
        'min_confidence', 0.7,
        'fields', jsonb_build_array(
          'contact.full_name','outside.age','contact.residence_country','contact.education_level',
          'contact.has_eu_family_member','contact.eu_entry_last_6_months',
          'funnel.interest_confirmed','lead.service_interest'
        ),
        'greeting_default', jsonb_build_object(
          'pt-BR','Olá! Eu sou a assistente virtual da CB ASESORIA. 😊',
          'es','¡Hola! Soy la asistente virtual de CB ASESORIA. 😊',
          'en','Hello! I am the virtual assistant of CB ASESORIA. 😊',
          'fr','Bonjour ! Je suis l''assistante virtuelle de CB ASESORIA. 😊'),
        'greeting_personalized', jsonb_build_object(
          'pt-BR','Olá {nome}! Eu sou a assistente virtual da CB ASESORIA.',
          'es','¡Hola {nome}! Soy la asistente virtual de CB ASESORIA.',
          'en','Hello {nome}! I am the virtual assistant of CB ASESORIA.',
          'fr','Bonjour {nome} ! Je suis l''assistante virtuelle de CB ASESORIA.'),
        'ack_message', jsonb_build_object(
          'pt-BR','Perfeito, obrigada!','es','¡Perfecto, gracias!','en','Perfect, thank you!','fr','Parfait, merci !')
      )
    ) RETURNING id INTO v_flow;
  END IF;

  DELETE FROM public.ai_agent_flow_steps WHERE flow_id = v_flow;

  -- PASSO 1: nome (obrigatório, bloqueante)
  INSERT INTO public.ai_agent_flow_steps
    (flow_id, step_code, name, description, message, messages, reask_messages, phase, answer_type,
     field_mapping, validation, next_step_code, allow_parallel_question, allow_free_answer, handoff, order_index)
  VALUES (
    v_flow, 'nome', 'Pergunta geral: nome', 'Nome obrigatório, informado pelo próprio cliente.',
    'Olá! Eu sou a assistente virtual da CB ASESORIA. 😊 Qual o seu nome?',
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Olá! Eu sou a assistente virtual da CB ASESORIA. 😊 Qual o seu nome?'),
      'es', jsonb_build_array('¡Hola! Soy la asistente virtual de CB ASESORIA. 😊 ¿Cuál es tu nombre?'),
      'en', jsonb_build_array('Hello! I am the virtual assistant of CB ASESORIA. 😊 What is your name?'),
      'fr', jsonb_build_array('Bonjour ! Je suis l''assistante virtuelle de CB ASESORIA. 😊 Quel est votre nom ?')),
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Não consegui identificar o seu nome. Poderia informá-lo novamente, por favor?'),
      'es', jsonb_build_array('No he podido identificar tu nombre. ¿Podrías indicármelo de nuevo, por favor?'),
      'en', jsonb_build_array('I could not identify your name. Could you tell me again, please?'),
      'fr', jsonb_build_array('Je n''ai pas réussi à identifier votre nom. Pourriez-vous me l''indiquer à nouveau, s''il vous plaît ?')),
    'PRE_HANDOFF', 'TEXTO_LIVRE', NULL,
    jsonb_build_object(
      'step_kind','PERGUNTA_GERAL','required',true,'format','NENHUM','options', jsonb_build_array(),
      'ack_enabled', false, 'max_reasks', 2, 'skip_mode','NUNCA',
      'unexpected_answer', jsonb_build_object('mode','INSISTIR','max_reasks',2),
      'general_capture', jsonb_build_object(
        'enabled', true, 'min_fields', 1, 'min_confidence', 0.7, 'non_blocking', false,
        'fields', jsonb_build_array(
          jsonb_build_object('source','full_name','target_field','contact.full_name','required',true,
            'prompts', jsonb_build_object(
              'pt-BR','Qual o seu nome?','es','¿Cuál es tu nombre?','en','What is your name?','fr','Quel est votre nom ?'))
        ))),
    'dados_pessoais', true, true, false, 1);

  -- PASSO 2: dados pessoais opcionais (não bloqueante, sem data de nascimento)
  INSERT INTO public.ai_agent_flow_steps
    (flow_id, step_code, name, description, message, messages, reask_messages, phase, answer_type,
     field_mapping, validation, next_step_code, allow_parallel_question, allow_free_answer, handoff, order_index)
  VALUES (
    v_flow, 'dados_pessoais', 'Pergunta geral: dados pessoais (opcionais)',
    'Uma única pergunta de qualificação. Nada aqui bloqueia o avanço nem o handoff.',
    'Para entender melhor o seu caso, farei algumas perguntas… me comente um pouco sobre você (idade, onde você mora, possui formação superior, possui algum familiar europeu, esteve na Europa nos últimos 6 meses).',
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Para entender melhor o seu caso, farei algumas perguntas… me comente um pouco sobre você (idade, onde você mora, possui formação superior, possui algum familiar europeu, esteve na Europa nos últimos 6 meses).'),
      'es', jsonb_build_array('Para entender mejor tu caso, te haré algunas preguntas… cuéntame un poco sobre ti (edad, dónde vives, si tienes formación superior, si tienes algún familiar europeo, si has estado en Europa en los últimos 6 meses).'),
      'en', jsonb_build_array('To better understand your case, I will ask you a few questions… tell me a bit about yourself (age, where you live, whether you have a university degree, whether you have any European relative, whether you have been in Europe in the last 6 months).'),
      'fr', jsonb_build_array('Pour mieux comprendre votre situation, je vais vous poser quelques questions… parlez-moi un peu de vous (âge, où vous habitez, si vous avez une formation universitaire, si vous avez un membre de votre famille européen, si vous avez été en Europe ces 6 derniers mois).')),
    '{}'::jsonb,
    'PRE_HANDOFF', 'TEXTO_LIVRE', NULL,
    jsonb_build_object(
      'step_kind','PERGUNTA_GERAL','required',false,'format','NENHUM','options', jsonb_build_array(),
      'ack_enabled', false, 'max_reasks', 0, 'skip_mode','SEMPRE',
      'unexpected_answer', jsonb_build_object('mode','PULAR','max_reasks',0),
      'general_capture', jsonb_build_object(
        'enabled', true, 'min_fields', 5, 'min_confidence', 0.7, 'non_blocking', true,
        'fields', jsonb_build_array(
          jsonb_build_object('source','age','target_field','outside.age','required',false,
            'prompts', jsonb_build_object('pt-BR','Qual é a sua idade?','es','¿Cuál es tu edad?','en','How old are you?','fr','Quel âge avez-vous ?')),
          jsonb_build_object('source','residence_country','target_field','contact.residence_country','required',false,
            'prompts', jsonb_build_object('pt-BR','Em qual país você mora atualmente?','es','¿En qué país vives actualmente?','en','Which country do you live in right now?','fr','Dans quel pays habitez-vous actuellement ?')),
          jsonb_build_object('source','education_superior','target_field','contact.education_level','required',false,
            'prompts', jsonb_build_object('pt-BR','Você possui formação superior?','es','¿Tienes formación superior?','en','Do you have a university degree?','fr','Avez-vous une formation universitaire ?')),
          jsonb_build_object('source','eu_family','target_field','contact.has_eu_family_member','required',false,
            'prompts', jsonb_build_object('pt-BR','Você possui algum familiar europeu?','es','¿Tienes algún familiar europeo?','en','Do you have any European relative?','fr','Avez-vous un membre de votre famille européen ?')),
          jsonb_build_object('source','europe_6m','target_field','contact.eu_entry_last_6_months','required',false,
            'prompts', jsonb_build_object('pt-BR','Você esteve na Europa nos últimos 6 meses?','es','¿Has estado en Europa en los últimos 6 meses?','en','Have you been in Europe in the last 6 months?','fr','Avez-vous été en Europe ces 6 derniers mois ?'))
        ))),
    'objetivo', true, true, false, 2);

  -- PASSO 3: objetivo/serviço (obrigatório)
  INSERT INTO public.ai_agent_flow_steps
    (flow_id, step_code, name, description, message, messages, reask_messages, phase, answer_type,
     field_mapping, validation, next_step_code, allow_parallel_question, allow_free_answer, handoff, order_index)
  VALUES (
    v_flow, 'objetivo', 'Pergunta geral: objetivo na Espanha',
    'Objetivo obrigatório até identificar com segurança um serviço ativo do catálogo.',
    E'E qual o seu objetivo na Espanha?\nVisto de estudos, residência para nômades, arraigos , nacionalidade espanhola, já possui oferta de trabalho ou outros?',
    jsonb_build_object(
      'pt-BR', jsonb_build_array(E'E qual o seu objetivo na Espanha?\nVisto de estudos, residência para nômades, arraigos , nacionalidade espanhola, já possui oferta de trabalho ou outros?'),
      'es', jsonb_build_array(E'¿Y cuál es tu objetivo en España?\n¿Visado de estudios, residencia para nómadas, arraigos, nacionalidad española, ya tienes oferta de trabajo u otros?'),
      'en', jsonb_build_array(E'And what is your goal in Spain?\nStudent visa, digital nomad residence, arraigo, Spanish citizenship, do you already have a job offer, or something else?'),
      'fr', jsonb_build_array(E'Et quel est votre objectif en Espagne ?\nVisa étudiant, résidence pour nomades, arraigo, nationalité espagnole, avez-vous déjà une offre d''emploi ou autre ?')),
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Não consegui identificar com segurança qual serviço corresponde ao seu objetivo. Poderia explicar novamente o que você pretende fazer na Espanha?'),
      'es', jsonb_build_array('No he podido identificar con seguridad qué servicio corresponde a tu objetivo. ¿Podrías explicarme de nuevo qué pretendes hacer en España?'),
      'en', jsonb_build_array('I could not clearly identify which service matches your goal. Could you explain again what you intend to do in Spain?'),
      'fr', jsonb_build_array('Je n''ai pas pu identifier avec certitude quel service correspond à votre objectif. Pourriez-vous expliquer à nouveau ce que vous comptez faire en Espagne ?')),
    'PRE_HANDOFF', 'TEXTO_LIVRE', NULL,
    jsonb_build_object(
      'step_kind','PERGUNTA_GERAL','required',true,'format','NENHUM','options', jsonb_build_array(),
      'ack_enabled', false, 'max_reasks', 2, 'skip_mode','NUNCA',
      'unexpected_answer', jsonb_build_object('mode','INSISTIR','max_reasks',2),
      'general_capture', jsonb_build_object(
        'enabled', true, 'min_fields', 1, 'min_confidence', 0.7, 'non_blocking', false,
        'fields', jsonb_build_array(
          jsonb_build_object('source','intent','target_field','funnel.interest_confirmed','required',true,
            'prompts', jsonb_build_object(
              'pt-BR',E'E qual o seu objetivo na Espanha?\nVisto de estudos, residência para nômades, arraigos , nacionalidade espanhola, já possui oferta de trabalho ou outros?',
              'es',E'¿Y cuál es tu objetivo en España?\n¿Visado de estudios, residencia para nómadas, arraigos, nacionalidad española, ya tienes oferta de trabajo u otros?',
              'en',E'And what is your goal in Spain?\nStudent visa, digital nomad residence, arraigo, Spanish citizenship, do you already have a job offer, or something else?',
              'fr',E'Et quel est votre objectif en Espagne ?\nVisa étudiant, résidence pour nomades, arraigo, nationalité espagnole, avez-vous déjà une offre d''emploi ou autre ?'))
        ))),
    'transferencia', true, true, false, 3);

  -- PASSO 4: handoff
  INSERT INTO public.ai_agent_flow_steps
    (flow_id, step_code, name, description, message, messages, reask_messages, phase, answer_type,
     field_mapping, validation, next_step_code, allow_parallel_question, allow_free_answer, handoff, order_index)
  VALUES (
    v_flow, 'transferencia', 'Transferência para o especialista', 'Encerra o pré-handoff e silencia o agente.',
    'Perfeito, {nome}. Obrigada pelas informações. Já reuni os dados iniciais sobre o seu caso e vou encaminhar o atendimento para um de nossos especialistas, que dará continuidade à sua solicitação.',
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Perfeito, {nome}. Obrigada pelas informações. Já reuni os dados iniciais sobre o seu caso e vou encaminhar o atendimento para um de nossos especialistas, que dará continuidade à sua solicitação.'),
      'es', jsonb_build_array('Perfecto, {nome}. Gracias por la información. Ya he reunido los datos iniciales sobre tu caso y voy a derivar la atención a uno de nuestros especialistas, que dará continuidad a tu solicitud.'),
      'en', jsonb_build_array('Perfect, {nome}. Thank you for the information. I have gathered the initial details about your case and I will forward your request to one of our specialists, who will continue your service.'),
      'fr', jsonb_build_array('Parfait, {nome}. Merci pour ces informations. J''ai réuni les premières données sur votre situation et je transmets votre demande à l''un de nos spécialistes, qui poursuivra votre accompagnement.')),
    '{}'::jsonb,
    'PRE_HANDOFF', 'NENHUM', NULL,
    jsonb_build_object('step_kind','FIM','required',false,'format','NENHUM','options', jsonb_build_array(),'ack_enabled', false),
    NULL, false, false, true, 4);
END $$;