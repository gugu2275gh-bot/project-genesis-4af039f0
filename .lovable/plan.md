
# Plano: Corrigir Erro de Upload de Recibos no Storage

## Diagnóstico do Problema

O erro "Erro ao salvar recibo no storage" ocorre porque as políticas RLS do bucket `client-documents` **não permitem que funcionários façam upload (INSERT)**:

| Política Atual | Operação | Problema |
|----------------|----------|----------|
| "Clients can upload their own documents" | INSERT | Requer que o caminho comece com `auth.uid()` |
| "Staff can update documents" | UPDATE | Permite atualizar, mas **não inserir** |
| "Staff can view all documents" | SELECT | OK |

O caminho `receipts/{payment_id}/{receipt_number}.pdf` não satisfaz nenhuma das políticas de INSERT existentes.

---

## Solução

Adicionar uma política de **INSERT** para staff no bucket `client-documents`:

```sql
CREATE POLICY "Staff can upload receipts and documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'client-documents' 
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = ANY (ARRAY[
      'ADMIN'::app_role, 
      'MANAGER'::app_role, 
      'FINANCEIRO'::app_role, 
      'JURIDICO'::app_role,
      'TECNICO'::app_role,
      'ATENCAO_CLIENTE'::app_role
    ])
  )
);
```

---

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| Nova migration SQL | Adicionar política INSERT para staff no bucket `client-documents` |

---

## Seção Tecnica

A migration completa:

```sql
-- Add INSERT policy for staff on client-documents bucket
CREATE POLICY "Staff can upload receipts and documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'client-documents' 
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = ANY (ARRAY[
      'ADMIN'::app_role, 
      'MANAGER'::app_role, 
      'FINANCEIRO'::app_role, 
      'JURIDICO'::app_role,
      'TECNICO'::app_role,
      'ATENCAO_CLIENTE'::app_role
    ])
  )
);
```

Apos essa migration, funcionarios com perfil ADMIN, MANAGER, FINANCEIRO, JURIDICO, TECNICO ou ATENCAO_CLIENTE poderao fazer upload de recibos e outros documentos no bucket `client-documents`.
