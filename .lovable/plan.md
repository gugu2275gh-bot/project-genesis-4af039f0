
# Plano: Novo Contrato/Serviço a partir de Lead com Contrato Cancelado

## Recomendacao de UX

A melhor abordagem e colocar o botao **na Ficha do Cliente (ContactDetail)**, na seccao de Servicos/Leads. Motivos:

1. **Ficha do Cliente** e o ponto central onde se ve todo o historico - leads, contratos, pagamentos. Faz sentido iniciar um novo ciclo a partir dali.
2. Na ficha ja existem os leads listados. Adicionar um botao "Novo Lead / Novo Servico" ali permite criar um novo lead para o mesmo contato, reiniciando o fluxo completo (Lead -> Oportunidade -> Contrato).
3. Manter tambem um botao contextual no **LeadDetail** quando o lead tem um contrato cancelado, permitindo "Reabrir como Novo Lead" diretamente.

O historico fica preservado porque o lead antigo e sua oportunidade/contrato cancelado permanecem intactos. O novo lead gera uma nova oportunidade e novo contrato.

## Alteracoes Tecnicas

### 1. Ficha do Cliente (ContactDetail.tsx) - Botao "Novo Servico"
- Na seccao onde os leads do cliente sao listados, adicionar um botao "+ Novo Servico"
- Ao clicar, abre um Dialog para selecionar o tipo de servico (service_interest) e notas iniciais
- Cria um novo Lead vinculado ao mesmo contact_id com status "NOVO"
- Navega para o detalhe do novo lead criado

### 2. Lead Detail (LeadDetail.tsx) - Botao "Novo Servico" contextual
- Quando o lead tem status INTERESSE_CONFIRMADO e sua oportunidade possui um contrato CANCELADO, exibir um botao "Iniciar Novo Servico"
- Esse botao cria um novo lead para o mesmo contato com status NOVO e navega para ele

### 3. Hook useLeads.ts - Nova mutacao createLeadForContact
- Adicionar uma mutacao `createLeadForContact` que recebe `contact_id`, `service_interest` e `notes`
- Cria o lead com status NOVO e retorna os dados para navegacao

### 4. Sem alteracoes no banco de dados
- Nenhuma migracao necessaria. O modelo atual ja suporta multiplos leads por contato.

## Fluxo Resumido

```text
Contrato Cancelado
       |
       v
Ficha do Cliente ou Lead Detail
       |
  [+ Novo Servico]
       |
       v
Novo Lead (status: NOVO)
       |
       v
Fluxo normal: Confirmar Interesse -> Oportunidade -> Contrato
```

O historico completo (lead antigo, oportunidade, contrato cancelado, pagamentos) permanece intacto e visivel na ficha do cliente.
