

# Plano: Cadastro de Documentos para EX19 e Data Prevista de Protocolo

## Contexto

O usuário precisa:
1. Cadastrar a lista completa de documentos para o serviço **Residência por Parente de Comunitário (EX19)**
2. Incluir informações de validade dos documentos (90 dias, 180 dias, 20 dias, etc.)
3. Permitir que o técnico defina a **data prevista de apresentação/protocolo** no sistema

---

## Situação Atual

| Item | Status |
|------|--------|
| Tipo de serviço `RESIDENCIA_PARENTE_COMUNITARIO` no enum | ❌ Não existe |
| Campo `validity_days` em `service_document_types` | ❌ Não existe |
| Campo `expected_protocol_date` em `service_cases` | ✅ Já existe |
| UI para definir data de protocolo prevista | ⚠️ Só mostra, não edita |
| Documentos cadastrados para EX19 | ❌ Não existem |

---

## Implementação

### 1. Adicionar Novo Tipo de Serviço ao Enum

```sql
ALTER TYPE service_interest ADD VALUE 'RESIDENCIA_PARENTE_COMUNITARIO';
```

Isso permitirá criar casos e documentos para este tipo de serviço.

---

### 2. Adicionar Campo de Validade dos Documentos

```sql
ALTER TABLE service_document_types 
ADD COLUMN validity_days INTEGER;
```

Exemplos de validade:
- 90 dias: Certidões de estado civil, empadronamento, convivência
- 180 dias: Certidão de casamento
- 20 dias: Certificado bancário

---

### 3. Cadastrar Documentos para EX19

Lista completa de documentos conforme especificação:

| Documento | Obrigatório | Apostila | Tradução | Validade |
|-----------|-------------|----------|----------|----------|
| Autorização para Tramitar | Sim | Não | Não | - |
| Formulário EX19 | Sim | Não | Não | - |
| Passaporte Completo do Interessado | Sim | Não | Não | - |
| Documento de Identidade/NIE do Parceiro | Sim | Não | Não | - |
| Passaporte ou ID do Parceiro | Sim | Não | Não | - |
| Certificado de Empadronamento de Ambos | Sim | Não | Não | 90 dias |
| Certificado de Convivência | Não | Não | Não | 90 dias |
| Certidão de Registro de União Estável | Não | Sim | Sim | 90 dias |
| Certidão de Casamento | Não | Sim | Sim | 180 dias |
| Contrato de Trabalho do Parceiro | Sim | Não | Não | - |
| Holerites do Parceiro (3 meses) | Sim | Não | Não | - |
| Informe de Vida Laboral do Parceiro | Sim | Não | Não | 90 dias |
| Certificado Bancário | Sim | Não | Não | 20 dias |
| Seguro de Saúde | Não | Não | Não | - |
| Certidão de Estado Civil do Interessado | Sim | Sim | Sim | 90 dias |
| Certidão de Estado Civil do Parceiro | Sim | Sim | Sim | 90 dias |

---

### 4. UI para Definir Data Prevista de Protocolo

Adicionar campo editável no `CaseDetail.tsx`:
- Mostrar na seção de informações do caso
- Usar DatePicker do Shadcn
- Atualizar via `updateCase` quando alterada
- Exibir alerta quando próximo do prazo (14 dias)

```text
┌──────────────────────────────────────────┐
│ Data Prevista de Protocolo              │
│ ┌────────────────────────┬─────────────┐│
│ │ 📅  15/02/2026         │  [Alterar]  ││
│ └────────────────────────┴─────────────┘│
│ ⚠️ Faltam 18 dias para o prazo          │
└──────────────────────────────────────────┘
```

---

### 5. Atualizar UI de Tipos de Documento

Adicionar exibição e edição do campo `validity_days`:
- No formulário de criação/edição
- Na tabela de listagem
- Com formato amigável (ex: "90 dias", "6 meses")

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/cases/CaseDetail.tsx` | Adicionar DatePicker para `expected_protocol_date` |
| `src/pages/settings/DocumentTypesManagement.tsx` | Adicionar campo `validity_days` no formulário |
| `src/types/database.ts` | Adicionar `RESIDENCIA_PARENTE_COMUNITARIO` aos labels |
| Migração SQL | Alterar enum, adicionar coluna, inserir documentos |

---

## Migração SQL Completa

```sql
-- 1. Adicionar novo tipo de serviço
ALTER TYPE service_interest ADD VALUE 'RESIDENCIA_PARENTE_COMUNITARIO';

-- 2. Adicionar campo de validade
ALTER TABLE service_document_types 
ADD COLUMN validity_days INTEGER;

-- 3. Inserir documentos para EX19
INSERT INTO service_document_types 
  (service_type, name, description, is_required, needs_apostille, needs_translation, validity_days)
VALUES
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Autorização para Tramitar', 
   'Documento gerado pelo técnico, deve ser assinado pelo interessado', 
   true, false, false, NULL),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Formulário EX19', 
   'Preenchido e gerado pelo técnico, assinado por ambos os interessados', 
   true, false, false, NULL),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Passaporte Completo do Interessado', 
   'Cópia digital (scanner) de todas as páginas do passaporte válido', 
   true, false, false, NULL),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Documento de Identidade/NIE do Parceiro', 
   'Cópia (frente e verso) do NIE, DNI ou passaporte do cônjuge/parceiro comunitário', 
   true, false, false, NULL),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Passaporte ou ID do Parceiro', 
   'Cópia completa de todas as páginas do passaporte ou documento de identidade do parceiro', 
   true, false, false, NULL),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Certificado de Empadronamento de Ambos', 
   'Documento de registro na prefeitura comprovando residência de ambos no mesmo endereço', 
   true, false, false, 90),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Certificado de Convivência', 
   'Comprovante oficial de convivência comum, se aplicável', 
   false, false, false, 90),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Certidão de Registro de União Estável', 
   'Registro de pareja de hecho atualizado (para parceiros não casados oficialmente)', 
   false, true, true, 90),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Certidão de Casamento', 
   'Devidamente apostilada/legalizada e traduzida por tradutor juramentado (se casamento fora da Espanha)', 
   false, true, true, 180),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Contrato de Trabalho do Parceiro', 
   'Contrato de trabalho do parceiro comunitário, assinado por ambas as partes', 
   true, false, false, NULL),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Holerites do Parceiro (3 meses)', 
   'Comprovantes de pagamento/salário do parceiro nos últimos 3 meses', 
   true, false, false, NULL),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Informe de Vida Laboral do Parceiro', 
   'Documento oficial de histórico laboral na Espanha', 
   true, false, false, 90),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Certificado Bancário', 
   'Comprovante emitido pelo banco mostrando os recursos financeiros/disponibilidade', 
   true, false, false, 20),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Seguro de Saúde', 
   'Cópia da apólice completa de seguro de saúde válido (público ou privado)', 
   false, false, false, NULL),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Certidão de Estado Civil do Interessado', 
   'Documento do país de origem comprovando estado civil, com apostila e tradução juramentada', 
   true, true, true, 90),
  
  ('RESIDENCIA_PARENTE_COMUNITARIO', 'Certidão de Estado Civil do Parceiro', 
   'Documento equivalente para o parceiro comunitário, apostilado e traduzido', 
   true, true, true, 90);
```

---

## Fluxo Atualizado

```text
+-------------------+     +--------------------+     +----------------------+
| Técnico libera    |     | Documentos EX19    |     | Cliente vê no        |
| documentos no     | --> | são criados com    | --> | portal com:          |
| primeiro contato  |     | validades          |     | • Prazo de validade  |
+-------------------+     +--------------------+     | • Apostila/Tradução  |
                                                     +----------------------+
                                                              |
                                                              v
                          +--------------------+     +----------------------+
                          | Alertas de         | <-- | Sistema monitora     |
                          | documentos         |     | validade e           |
                          | vencendo           |     | data de protocolo    |
                          +--------------------+     +----------------------+
```

---

## UI para Validade de Documentos

No portal do cliente, mostrar indicadores visuais:

```text
┌─────────────────────────────────────────────────────────────┐
│ 📄 Certificado de Empadronamento             ⬜ Não Enviado │
│    📅 Validade: 90 dias após emissão                        │
│    ⚠️ Deve ser emitido há menos de 90 dias na data do       │
│       protocolo                                              │
├─────────────────────────────────────────────────────────────┤
│ 📄 Certidão de Casamento                     ⬜ Não Enviado │
│    📅 Validade: 180 dias após emissão                       │
│    🔴 Requer Apostila de Haia                               │
│    🔵 Requer Tradução Juramentada                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Validação de Validade

Quando o técnico for submeter ao jurídico, o sistema deve verificar:
1. Todos os documentos com validade definida
2. Calcular se estarão válidos na data prevista de protocolo
3. Alertar se algum documento estará vencido

---

## Resultado Esperado

1. Novo tipo de serviço `RESIDENCIA_PARENTE_COMUNITARIO` disponível
2. 16 documentos cadastrados com todas as informações necessárias
3. Validades dos documentos visíveis para cliente e técnico
4. Data prevista de protocolo editável pelo técnico
5. Sistema preparado para alertas de documentos vencendo

---

## Detalhes Técnicos

### Atualização do DatePicker no CaseDetail

```typescript
// Estado para controlar o popover
const [protocolDateOpen, setProtocolDateOpen] = useState(false);

// Handler para atualizar data
const handleProtocolDateChange = async (date: Date | undefined) => {
  if (date) {
    await updateCase.mutateAsync({
      id: serviceCase.id,
      expected_protocol_date: format(date, 'yyyy-MM-dd'),
    });
  }
  setProtocolDateOpen(false);
};
```

### Cálculo de dias até o protocolo

```typescript
const daysUntilProtocol = serviceCase.expected_protocol_date
  ? differenceInDays(new Date(serviceCase.expected_protocol_date), new Date())
  : null;

const protocolUrgency = daysUntilProtocol !== null
  ? daysUntilProtocol <= 7 ? 'danger'
  : daysUntilProtocol <= 14 ? 'warning'
  : 'normal'
  : null;
```

