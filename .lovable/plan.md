

## Plano: Auto-preencher "Detalhes de Pagamento" com dados do acordo do contato

### Problema

O campo "Detalhes de Pagamento" no contrato não está sendo preenchido com os dados do acordo de pagamento (imagem 1). A lógica atual tenta reconstruir o texto a partir dos registros de pagamento, mas perde informações como o nome do serviço específico por pagamento, taxas, IVA, etc.

### Solução

Usar diretamente o `payment_notes` do contato (onde o `PaymentAgreementDialog` já salva o resumo formatado completo) como fonte para auto-preencher o campo `installment_conditions`.

### Alterações em `src/pages/contracts/ContractDetail.tsx`

1. **Buscar `payment_notes` do contato vinculado ao contrato**: Adicionar query para buscar o campo `payment_notes` do contato via `contract → opportunities → leads → contacts`

2. **Substituir a lógica de `formattedPaymentText`**: Em vez de reconstruir o texto a partir dos registros de pagamento individuais, usar diretamente o `payment_notes` do contato

3. **Atualizar o `useEffect` de auto-populate**: Usar o `payment_notes` como fonte, mantendo a regra de só preencher quando o campo estiver vazio (editável após preenchido)

### Fluxo

```text
PaymentAgreementDialog salva summary → contact.payment_notes
                                            ↓
ContractDetail lê contact.payment_notes → preenche installment_conditions
                                            ↓
Usuário pode editar livremente o campo
```

