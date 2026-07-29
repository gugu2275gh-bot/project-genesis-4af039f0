UPDATE public.ai_agent_flow_steps
SET messages = jsonb_build_object(
  'pt-BR', jsonb_build_array('Olá, {nome}! Eu sou a assistente virtual da CB ASESORIA. 😊' || chr(10) || 'Para entender melhor o seu caso, farei algumas perguntas… me comente um pouco sobre você (idade, onde você mora, possui formação superior, possui algum familiar europeu, esteve na Europa nos últimos 6 meses).'),
  'es', jsonb_build_array('¡Hola, {nome}! Soy la asistente virtual de CB ASESORIA. 😊' || chr(10) || 'Para entender mejor tu caso, te haré algunas preguntas… cuéntame un poco sobre ti (edad, dónde vives, si tienes formación universitaria, si tienes algún familiar europeo, si has estado en Europa en los últimos 6 meses).'),
  'en', jsonb_build_array('Hello, {nome}! I am the virtual assistant of CB ASESORIA. 😊' || chr(10) || 'To better understand your case, I will ask you a few questions… tell me a bit about yourself (age, where you live, whether you have a university degree, whether you have any European relative, whether you have been in Europe in the last 6 months).'),
  'fr', jsonb_build_array('Bonjour, {nome} ! Je suis l''assistante virtuelle de CB ASESORIA. 😊' || chr(10) || 'Pour mieux comprendre votre situation, je vais vous poser quelques questions… parlez-moi un peu de vous (âge, où vous habitez, si vous avez un diplôme universitaire, si vous avez un membre de votre famille européen, si vous avez été en Europe ces 6 derniers mois).')
),
validation = jsonb_set(
  validation,
  '{general_capture}',
  jsonb_build_object(
    'enabled', true,
    'min_confidence', 0.7,
    'min_fields', 5,
    'fields', jsonb_build_array(
      jsonb_build_object('source','age','target_field','outside.age','required',true,'prompts',jsonb_build_object(
        'pt-BR','Qual é a sua idade?','es','¿Cuál es tu edad?','en','How old are you?','fr','Quel âge avez-vous ?')),
      jsonb_build_object('source','residence_country','target_field','contact.residence_country','required',true,'prompts',jsonb_build_object(
        'pt-BR','Onde você mora hoje (qual país)?','es','¿Dónde vives actualmente (en qué país)?','en','Where do you live right now (which country)?','fr','Où habitez-vous actuellement (dans quel pays) ?')),
      jsonb_build_object('source','education_superior','target_field','contact.education_level','required',true,'prompts',jsonb_build_object(
        'pt-BR','Você possui formação superior?','es','¿Tienes formación universitaria?','en','Do you have a university degree?','fr','Avez-vous un diplôme universitaire ?')),
      jsonb_build_object('source','eu_family','target_field','contact.has_eu_family_member','required',true,'prompts',jsonb_build_object(
        'pt-BR','Você possui algum familiar europeu?','es','¿Tienes algún familiar europeo?','en','Do you have any European relative?','fr','Avez-vous un membre de votre famille européen ?')),
      jsonb_build_object('source','europe_6m','target_field','contact.eu_entry_last_6_months','required',true,'prompts',jsonb_build_object(
        'pt-BR','Você esteve na Europa nos últimos 6 meses?','es','¿Has estado en Europa en los últimos 6 meses?','en','Have you been in Europe in the last 6 months?','fr','Avez-vous été en Europe ces 6 derniers mois ?')),
      jsonb_build_object('source','full_name','target_field','contact.full_name','required',false,'prompts',jsonb_build_object(
        'pt-BR','Como você se chama?','es','¿Cómo te llamas?','en','What is your name?','fr','Comment vous appelez-vous ?'))
    )
  )
)
WHERE id = '4fd3694e-3f52-4c9e-bbb5-4cd2c3d56b42';

UPDATE public.ai_agent_flow_steps
SET messages = jsonb_build_object(
  'pt-BR', jsonb_build_array('E qual o seu objetivo na Espanha?' || chr(10) || chr(10) || 'Visto de estudos, residência para nômades, arraigos, nacionalidade espanhola, já possui oferta de trabalho ou outros?'),
  'es', jsonb_build_array('¿Y cuál es tu objetivo en España?' || chr(10) || chr(10) || '¿Visado de estudios, residencia para nómadas digitales, arraigos, nacionalidad española, ya tienes una oferta de trabajo u otros?'),
  'en', jsonb_build_array('And what is your goal in Spain?' || chr(10) || chr(10) || 'Student visa, digital nomad residence, arraigo, Spanish citizenship, do you already have a job offer, or something else?'),
  'fr', jsonb_build_array('Et quel est votre objectif en Espagne ?' || chr(10) || chr(10) || 'Visa étudiant, résidence pour nomades numériques, arraigo, nationalité espagnole, avez-vous déjà une offre d''emploi ou autre chose ?')
),
validation = jsonb_set(
  validation,
  '{general_capture,fields,0,prompts}',
  jsonb_build_object(
    'pt-BR','E qual o seu objetivo na Espanha? (visto de estudos, residência para nômades, arraigos, nacionalidade espanhola, oferta de trabalho ou outros)',
    'es','¿Y cuál es tu objetivo en España? (visado de estudios, residencia para nómadas, arraigos, nacionalidad española, oferta de trabajo u otros)',
    'en','And what is your goal in Spain? (student visa, digital nomad residence, arraigo, Spanish citizenship, job offer or other)',
    'fr','Et quel est votre objectif en Espagne ? (visa étudiant, résidence nomade, arraigo, nationalité espagnole, offre d''emploi ou autre)'
  )
)
WHERE id = 'a9f349d8-d989-40b5-9c33-0aec34b19ff7';