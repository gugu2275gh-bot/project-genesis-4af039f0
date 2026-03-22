-- Add new roles to enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'EXPEDIENTE';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'DIRETORIA';

-- Insert missing profile definitions
INSERT INTO user_profile_definitions (role_code, display_name, detailed_description, is_active, display_order)
VALUES 
  ('EXPEDIENTE', 'Expediente', 'Responsável pela gestão de expedientes e processos internos', true, 8),
  ('DIRETORIA', 'Diretoria', 'Membro da diretoria com acesso estratégico ao sistema', true, 9)
ON CONFLICT (role_code) DO NOTHING;