-- Adicionar novas configurações SLA para revisão técnica e envio ao jurídico
INSERT INTO system_config (key, value, description) VALUES
  ('sla_tech_review_tech_alert_hours', '48', 'Horas para alertar técnico sobre revisão técnica pendente'),
  ('sla_tech_review_coord_alert_days', '5', 'Dias para alertar coordenador sobre revisão técnica pendente'),
  ('sla_tech_review_admin_alert_days', '7', 'Dias para alertar admin sobre revisão técnica pendente'),
  ('sla_send_legal_tech_alert_days', '3', 'Dias para alertar técnico sobre envio ao jurídico'),
  ('sla_send_legal_coord_alert_days', '5', 'Dias para alertar coordenador sobre envio ao jurídico'),
  ('sla_send_legal_admin_alert_days', '8', 'Dias para alertar admin sobre envio ao jurídico')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;