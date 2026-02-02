-- Add templates for TIE pickup appointments (D-3, D-1, post-cita verification, case closure)
INSERT INTO system_config (key, value) VALUES
('template_tie_pickup_d3', 'Ola {nome}! Lembrete: sua cita para retirada do TIE esta marcada para {data} as {hora}. Local: {local}. Leve: Passaporte, Resguardo e Taxa 790.'),
('template_tie_pickup_d1', 'Ola {nome}! Amanha e sua cita de retirada do TIE! {hora} em {local}. Documentos: Passaporte, Resguardo, Taxa 790. Boa sorte!'),
('template_tie_post_cita_verification', 'Ola {nome}! Sua cita de retirada do TIE era dia {data}. Voce conseguiu retirar seu documento com sucesso? Por favor, confirme para darmos continuidade.'),
('template_case_closure_success', 'Parabens, {nome}! Seu processo foi concluido com sucesso! Agradecemos a confianca. Seu TIE e valido ate {validade_tie}. Para futuras necessidades, estamos a disposicao!')
ON CONFLICT (key) DO NOTHING;