WITH f AS (
  INSERT INTO public.ai_agent_flows (name, description, status, phase, intake_config, canvas)
  VALUES (
    'teste aberto',
    'Fluxo pré-handoff com pergunta geral aberta: interpreta a resposta livre do cliente, preenche vários campos e só pergunta o que faltar.',
    'RASCUNHO',
    'PRE_HANDOFF',
    jsonb_build_object(
      'enabled', true,
      'min_confidence', 0.7,
      'fields', jsonb_build_array(
        'contact.full_name','contact.email','outside.age','funnel.empadronado_city',
        'contact.education_level','contact.has_eu_family_member','contact.eu_entry_last_6_months',
        'funnel.interest_confirmed','lead.service_interest'
      ),
      'ack_message', jsonb_build_object(
        'pt-BR','Perfeito, obrigada!','es','¡Perfecto, gracias!','en','Perfect, thank you!','fr','Parfait, merci !'
      ),
      'greeting_default', jsonb_build_object(
        'pt-BR','Olá! Eu sou a assistente virtual da CB ASESORIA. 😊',
        'es','¡Hola! Soy la asistente virtual de CB ASESORIA. 😊',
        'en','Hello! I am CB ASESORIA''s virtual assistant. 😊',
        'fr','Bonjour ! Je suis l''assistante virtuelle de CB ASESORIA. 😊'
      ),
      'greeting_personalized', jsonb_build_object(
        'pt-BR','Olá, {nome}! Eu sou a assistente virtual da CB ASESORIA. 😊 {resumo}',
        'es','¡Hola, {nome}! Soy la asistente virtual de CB ASESORIA. 😊 {resumo}',
        'en','Hi, {nome}! I am CB ASESORIA''s virtual assistant. 😊 {resumo}',
        'fr','Bonjour, {nome} ! Je suis l''assistante virtuelle de CB ASESORIA. 😊 {resumo}'
      )
    ),
    '{}'::jsonb
  )
  RETURNING id
)
INSERT INTO public.ai_agent_flow_steps
  (flow_id, step_code, name, message, messages, reask_messages, answer_type, field_mapping,
   validation, next_step_code, order_index, phase, handoff, allow_free_answer, allow_parallel_question)
SELECT f.id, s.step_code, s.name, s.message, s.messages, s.reask_messages, s.answer_type, s.field_mapping,
       s.validation, s.next_step_code, s.order_index, 'PRE_HANDOFF', s.handoff, true, true
FROM f, (VALUES
  (
    'abertura_geral',
    'Saudação + pergunta geral aberta',
    'Olá, {nome}! Eu sou a assistente virtual da CB ASESORIA. 😊',
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Olá, {nome}! Eu sou a assistente virtual da CB ASESORIA. 😊
Para entender melhor o seu caso, farei algumas perguntas… me comente um pouco sobre você (idade, onde você mora, possui formação superior, possui algum familiar europeu, esteve na Europa nos últimos 6 meses).

E qual o seu objetivo na Espanha? Visto de estudos, residência para nômades, arraigos, nacionalidade espanhola, já possui oferta de trabalho ou outros?'),
      'es', jsonb_build_array('¡Hola, {nome}! Soy la asistente virtual de CB ASESORIA. 😊
Para entender mejor tu caso, te haré algunas preguntas… cuéntame un poco sobre ti (edad, dónde vives, si tienes formación universitaria, si tienes algún familiar europeo, si has estado en Europa en los últimos 6 meses).

¿Y cuál es tu objetivo en España? Visado de estudios, residencia para nómadas digitales, arraigos, nacionalidad española, ya tienes una oferta de trabajo u otros?'),
      'en', jsonb_build_array('Hi, {nome}! I am CB ASESORIA''s virtual assistant. 😊
To understand your case better, I will ask you a few questions… tell me a bit about yourself (age, where you live, whether you have a university degree, whether you have a European relative, whether you have been in Europe in the last 6 months).

And what is your goal in Spain? Student visa, digital nomad residency, arraigo, Spanish nationality, do you already have a job offer, or something else?'),
      'fr', jsonb_build_array('Bonjour, {nome} ! Je suis l''assistante virtuelle de CB ASESORIA. 😊
Pour mieux comprendre votre situation, je vais vous poser quelques questions… parlez-moi un peu de vous (âge, où vous habitez, si vous avez un diplôme universitaire, si vous avez de la famille européenne, si vous avez été en Europe ces 6 derniers mois).

Et quel est votre objectif en Espagne ? Visa d''études, résidence pour nomades numériques, arraigo, nationalité espagnole, avez-vous déjà une offre d''emploi, ou autre chose ?')
    ),
    jsonb_build_object(
      'pt-BR','Sem problema! Me conta com suas palavras: sua idade, onde mora e o que você busca aqui na Espanha.',
      'es','¡Sin problema! Cuéntame con tus palabras: tu edad, dónde vives y qué buscas aquí en España.',
      'en','No problem! Tell me in your own words: your age, where you live and what you are looking for in Spain.',
      'fr','Pas de souci ! Dites-moi avec vos mots : votre âge, où vous habitez et ce que vous cherchez en Espagne.'
    ),
    'TEXTO_LIVRE', NULL,
    jsonb_build_object(
      'step_kind','PERGUNTA_GERAL','required',true,'format','NENHUM','max_reasks',1,'ack_enabled',false,
      'skip_mode','NUNCA','options', jsonb_build_array(),
      'general_capture', jsonb_build_object(
        'enabled', true, 'min_confidence', 0.7,
        'fields', jsonb_build_array(
          jsonb_build_object('source','full_name','target_field','contact.full_name'),
          jsonb_build_object('source','age','target_field','outside.age'),
          jsonb_build_object('source','city','target_field','funnel.empadronado_city'),
          jsonb_build_object('source','education_superior','target_field','contact.education_level'),
          jsonb_build_object('source','eu_family','target_field','contact.has_eu_family_member'),
          jsonb_build_object('source','europe_6m','target_field','contact.eu_entry_last_6_months'),
          jsonb_build_object('source','intent','target_field','funnel.interest_confirmed'),
          jsonb_build_object('source','email','target_field','contact.email')
        )
      ),
      'unexpected_answer', jsonb_build_object('mode','ACEITAR_APROXIMADO','max_reasks',1)
    ),
    'nome', 1, false
  ),
  (
    'nome','Nome',
    'Como é seu nome?',
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Só para eu te chamar direitinho: como é o seu nome?'),
      'es', jsonb_build_array('Solo para llamarte correctamente: ¿cómo te llamas?'),
      'en', jsonb_build_array('Just so I address you properly: what is your name?'),
      'fr', jsonb_build_array('Juste pour bien vous appeler : quel est votre nom ?')
    ),
    jsonb_build_object(
      'pt-BR','Pode me dizer só o seu nome, por favor?',
      'es','¿Puedes decirme solo tu nombre, por favor?',
      'en','Could you tell me just your name, please?',
      'fr','Pouvez-vous me dire simplement votre nom, s''il vous plaît ?'
    ),
    'NOME','contact.full_name',
    jsonb_build_object('step_kind','PERGUNTA','required',true,'format','NENHUM','max_reasks',2,'ack_enabled',false,
      'name_mode','SIMPLES','skip_mode','CAMPO_PREENCHIDO','skip_field','contact.full_name','options', jsonb_build_array(),
      'unexpected_answer', jsonb_build_object('mode','ACEITAR_APROXIMADO','max_reasks',2)),
    'idade', 2, false
  ),
  (
    'idade','Idade',
    'Qual a sua idade?',
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Qual a sua idade?'),
      'es', jsonb_build_array('¿Cuál es tu edad?'),
      'en', jsonb_build_array('How old are you?'),
      'fr', jsonb_build_array('Quel âge avez-vous ?')
    ),
    jsonb_build_object(
      'pt-BR','Pode me dizer sua idade em números? Ex.: 34',
      'es','¿Puedes decirme tu edad en números? Ej.: 34',
      'en','Could you tell me your age in numbers? E.g.: 34',
      'fr','Pouvez-vous me donner votre âge en chiffres ? Ex. : 34'
    ),
    'NUMERO','outside.age',
    jsonb_build_object('step_kind','PERGUNTA','required',true,'format','NUMERO','max_reasks',2,'ack_enabled',false,
      'skip_mode','CAMPO_PREENCHIDO','skip_field','outside.age','options', jsonb_build_array(),
      'unexpected_answer', jsonb_build_object('mode','ACEITAR_APROXIMADO','max_reasks',2)),
    'cidade', 3, false
  ),
  (
    'cidade','Cidade onde mora',
    'Em qual cidade você mora hoje?',
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Em qual cidade você mora hoje?'),
      'es', jsonb_build_array('¿En qué ciudad vives actualmente?'),
      'en', jsonb_build_array('Which city do you currently live in?'),
      'fr', jsonb_build_array('Dans quelle ville habitez-vous actuellement ?')
    ),
    jsonb_build_object(
      'pt-BR','Só o nome da cidade já me ajuda. 🙂',
      'es','Solo el nombre de la ciudad ya me ayuda. 🙂',
      'en','Just the city name is enough. 🙂',
      'fr','Le nom de la ville suffit. 🙂'
    ),
    'TEXTO_LIVRE','funnel.empadronado_city',
    jsonb_build_object('step_kind','PERGUNTA','required',true,'format','NENHUM','max_reasks',2,'ack_enabled',false,
      'skip_mode','CAMPO_PREENCHIDO','skip_field','funnel.empadronado_city','options', jsonb_build_array(),
      'unexpected_answer', jsonb_build_object('mode','ACEITAR_APROXIMADO','max_reasks',2)),
    'formacao', 4, false
  ),
  (
    'formacao','Formação superior',
    'Você possui formação superior?',
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Você possui formação superior?'),
      'es', jsonb_build_array('¿Tienes formación universitaria?'),
      'en', jsonb_build_array('Do you have a university degree?'),
      'fr', jsonb_build_array('Avez-vous un diplôme universitaire ?')
    ),
    jsonb_build_object(
      'pt-BR','Pode responder Sim ou Não. 🙂',
      'es','Puedes responder Sí o No. 🙂',
      'en','You can answer Yes or No. 🙂',
      'fr','Vous pouvez répondre Oui ou Non. 🙂'
    ),
    'SIM_NAO','contact.education_level',
    jsonb_build_object('step_kind','PERGUNTA','required',true,'format','NENHUM','max_reasks',2,'ack_enabled',false,
      'quick_reply',true,'skip_mode','CAMPO_PREENCHIDO','skip_field','contact.education_level',
      'options', jsonb_build_array('Sim','Não'),
      'options_i18n', jsonb_build_object('es', jsonb_build_array('Sí','No'), 'en', jsonb_build_array('Yes','No'), 'fr', jsonb_build_array('Oui','Non')),
      'unexpected_answer', jsonb_build_object('mode','ACEITAR_APROXIMADO','max_reasks',2)),
    'familiar_europeu', 5, false
  ),
  (
    'familiar_europeu','Familiar europeu',
    'Você possui algum familiar europeu?',
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Você possui algum familiar europeu (pais, avós, cônjuge)?'),
      'es', jsonb_build_array('¿Tienes algún familiar europeo (padres, abuelos, cónyuge)?'),
      'en', jsonb_build_array('Do you have any European relative (parents, grandparents, spouse)?'),
      'fr', jsonb_build_array('Avez-vous de la famille européenne (parents, grands-parents, conjoint) ?')
    ),
    jsonb_build_object(
      'pt-BR','Pode responder Sim ou Não. 🙂',
      'es','Puedes responder Sí o No. 🙂',
      'en','You can answer Yes or No. 🙂',
      'fr','Vous pouvez répondre Oui ou Non. 🙂'
    ),
    'SIM_NAO','contact.has_eu_family_member',
    jsonb_build_object('step_kind','PERGUNTA','required',true,'format','NENHUM','max_reasks',2,'ack_enabled',false,
      'quick_reply',true,'skip_mode','CAMPO_PREENCHIDO','skip_field','contact.has_eu_family_member',
      'options', jsonb_build_array('Sim','Não'),
      'options_i18n', jsonb_build_object('es', jsonb_build_array('Sí','No'), 'en', jsonb_build_array('Yes','No'), 'fr', jsonb_build_array('Oui','Non')),
      'unexpected_answer', jsonb_build_object('mode','ACEITAR_APROXIMADO','max_reasks',2)),
    'europa_6m', 6, false
  ),
  (
    'europa_6m','Europa nos últimos 6 meses',
    'Você esteve na Europa nos últimos 6 meses?',
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Você esteve na Europa nos últimos 6 meses?'),
      'es', jsonb_build_array('¿Has estado en Europa en los últimos 6 meses?'),
      'en', jsonb_build_array('Have you been in Europe in the last 6 months?'),
      'fr', jsonb_build_array('Avez-vous séjourné en Europe ces 6 derniers mois ?')
    ),
    jsonb_build_object(
      'pt-BR','Pode responder Sim ou Não. 🙂',
      'es','Puedes responder Sí o No. 🙂',
      'en','You can answer Yes or No. 🙂',
      'fr','Vous pouvez répondre Oui ou Non. 🙂'
    ),
    'SIM_NAO','contact.eu_entry_last_6_months',
    jsonb_build_object('step_kind','PERGUNTA','required',true,'format','NENHUM','max_reasks',2,'ack_enabled',false,
      'quick_reply',true,'skip_mode','CAMPO_PREENCHIDO','skip_field','contact.eu_entry_last_6_months',
      'options', jsonb_build_array('Sim','Não'),
      'options_i18n', jsonb_build_object('es', jsonb_build_array('Sí','No'), 'en', jsonb_build_array('Yes','No'), 'fr', jsonb_build_array('Oui','Non')),
      'unexpected_answer', jsonb_build_object('mode','ACEITAR_APROXIMADO','max_reasks',2)),
    'objetivo', 7, false
  ),
  (
    'objetivo','Objetivo na Espanha',
    'Qual o seu objetivo na Espanha?',
    jsonb_build_object(
      'pt-BR', jsonb_build_array('E qual o seu objetivo na Espanha? Visto de estudos, residência para nômades, arraigos, nacionalidade espanhola, oferta de trabalho ou outro?'),
      'es', jsonb_build_array('¿Y cuál es tu objetivo en España? Visado de estudios, residencia para nómadas, arraigos, nacionalidad española, oferta de trabajo u otro?'),
      'en', jsonb_build_array('And what is your goal in Spain? Student visa, digital nomad residency, arraigo, Spanish nationality, job offer or something else?'),
      'fr', jsonb_build_array('Et quel est votre objectif en Espagne ? Visa d''études, résidence nomade, arraigo, nationalité espagnole, offre d''emploi ou autre ?')
    ),
    jsonb_build_object(
      'pt-BR','Pode me dizer com suas palavras o que você busca aqui na Espanha?',
      'es','¿Puedes decirme con tus palabras qué buscas aquí en España?',
      'en','Could you tell me in your own words what you are looking for in Spain?',
      'fr','Pouvez-vous me dire avec vos mots ce que vous cherchez en Espagne ?'
    ),
    'TEXTO_LIVRE','funnel.interest_confirmed',
    jsonb_build_object('step_kind','PERGUNTA','required',true,'format','NENHUM','max_reasks',2,'ack_enabled',false,
      'skip_mode','CAMPO_PREENCHIDO','skip_field','funnel.interest_confirmed','options', jsonb_build_array(),
      'unexpected_answer', jsonb_build_object('mode','ACEITAR_APROXIMADO','max_reasks',2)),
    'email', 8, false
  ),
  (
    'email','E-mail',
    'Qual é o melhor e-mail para contato?',
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Qual é o melhor e-mail para te enviarmos as orientações e acompanhar seu caso?'),
      'es', jsonb_build_array('¿Cuál es el mejor correo electrónico para enviarte las orientaciones y hacer el seguimiento de tu caso?'),
      'en', jsonb_build_array('What is the best email address for us to send you guidance and follow up on your case?'),
      'fr', jsonb_build_array('Quel est le meilleur e-mail pour vous envoyer les informations et suivre votre dossier ?')
    ),
    jsonb_build_object(
      'pt-BR','Preciso de um e-mail válido, por exemplo: nome@email.com',
      'es','Necesito un correo válido, por ejemplo: nombre@email.com',
      'en','I need a valid email, for example: name@email.com',
      'fr','J''ai besoin d''un e-mail valide, par exemple : nom@email.com'
    ),
    'EMAIL','contact.email',
    jsonb_build_object('step_kind','PERGUNTA','required',true,'format','EMAIL','max_reasks',2,'ack_enabled',false,
      'skip_mode','CAMPO_PREENCHIDO','skip_field','contact.email','options', jsonb_build_array(),
      'unexpected_answer', jsonb_build_object('mode','INSISTIR','max_reasks',2)),
    'encerramento', 9, false
  ),
  (
    'encerramento','Encerramento e encaminhamento',
    'Obrigada! Vou te encaminhar para o especialista certo.',
    jsonb_build_object(
      'pt-BR', jsonb_build_array('Perfeito, muito obrigada! 🙌 Já tenho as informações principais do seu caso. Vou te encaminhar agora para o especialista certo da CB ASESORIA, que segue com você por aqui mesmo.'),
      'es', jsonb_build_array('¡Perfecto, muchas gracias! 🙌 Ya tengo la información principal de tu caso. Te derivo ahora al especialista adecuado de CB ASESORIA, que continuará contigo por aquí mismo.'),
      'en', jsonb_build_array('Perfect, thank you very much! 🙌 I now have the main information about your case. I will forward you to the right CB ASESORIA specialist, who will continue with you right here.'),
      'fr', jsonb_build_array('Parfait, merci beaucoup ! 🙌 J''ai les informations principales de votre dossier. Je vous transfère maintenant au bon spécialiste de CB ASESORIA, qui poursuivra avec vous ici même.')
    ),
    '{}'::jsonb,
    'TEXTO_LIVRE', NULL,
    jsonb_build_object('step_kind','FIM','required',false,'format','NENHUM','ack_enabled',false,'options', jsonb_build_array()),
    NULL, 10, true
  )
) AS s(step_code, name, message, messages, reask_messages, answer_type, field_mapping, validation, next_step_code, order_index, handoff);