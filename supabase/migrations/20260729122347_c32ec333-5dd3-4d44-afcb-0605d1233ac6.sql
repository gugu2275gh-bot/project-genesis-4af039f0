UPDATE public.ai_agent_flow_steps
SET message = to_jsonb(ARRAY['Para entender melhor o seu caso, farei algumas perguntas… me comente um pouco sobre você (idade, onde você mora, possui formação superior, possui algum familiar europeu, esteve na Europa nos últimos 6 meses)']),
    messages = jsonb_build_object(
      'pt-BR', to_jsonb(ARRAY['Para entender melhor o seu caso, farei algumas perguntas… me comente um pouco sobre você (idade, onde você mora, possui formação superior, possui algum familiar europeu, esteve na Europa nos últimos 6 meses)']),
      'es', to_jsonb(ARRAY['Para entender mejor tu caso, te haré algunas preguntas… cuéntame un poco sobre ti (edad, dónde vives, si tienes formación universitaria, si tienes algún familiar europeo, si has estado en Europa en los últimos 6 meses)']),
      'en', to_jsonb(ARRAY['To understand your case better, I will ask you a few questions… tell me a bit about yourself (age, where you live, whether you have a university degree, whether you have a European relative, whether you have been in Europe in the last 6 months)']),
      'fr', to_jsonb(ARRAY['Pour mieux comprendre votre situation, je vais vous poser quelques questions… parlez-moi un peu de vous (âge, où vous habitez, si vous avez un diplôme universitaire, si vous avez de la famille européenne, si vous avez été en Europe ces 6 derniers mois)'])
    ),
    updated_at = now()
WHERE flow_id = 'a3e2a1d1-66d7-4527-b215-f66ae134f4ef' AND step_code = 'dados_pessoais';