

## Análise: Ciclo de vida de pagamentos e serviços repetidos

### Como funciona hoje

O sistema já possui uma estrutura que **isola cada atendimento** por cadeia:

```text
Contato (cliente)
  └── Lead 1 (serviço X) ──→ Oportunidade 1 ──→ Pagamentos 1a, 1b
  └── Lead 2 (serviço Y) ──→ Oportunidade 2 ──→ Pagamentos 2a, 2b
```

Cada vez que o "Forma de Pagamento" é usado para um novo serviço, ele cria um **novo Lead + nova Oportunidade + novos Pagamentos**. Então os pagamentos do serviço antigo e do novo já são separados por `opportunity_id`.

### O problema: não há "encerramento" formal

Atualmente, quando todos os pagamentos são confirmados, a oportunidade vai para `FECHADA_GANHA` e o caso técnico segue seu fluxo (`CONTATO_INICIAL` → ... → `ENCERRADO_APROVADO` ou `ENCERRADO_NEGADO`). **Porém**, não existe um mecanismo que "feche" explicitamente o ciclo financeiro/contratual de forma que o sistema diferencie claramente "atendimento concluído" de "atendimento ativo".

Na prática, isso já funciona porque:
- Pagamentos `CONFIRMADO` não aparecem como pendentes
- Casos técnicos com status `ENCERRADO_*` são tratados como finalizados
- Um novo serviço cria uma cadeia completamente nova

### Onde pode haver confusão

1. **No contrato**: Os pagamentos são filtrados por `contract_id`. Se o contrato não for vinculado, pode puxar dados errados. (Já discutimos a correção com filtro por `opportunity_id`.)

2. **Na ficha do contato (ContactDetail)**: A seção "Serviços & Pagamentos" mostra **todos** os leads/pagamentos do contato. Não há separação visual clara entre "concluído" e "ativo".

### Sugestão de melhoria

Adicionar uma **indicação visual de status** na seção "Serviços & Pagamentos" da ficha do contato:

1. **Serviços com caso técnico `ENCERRADO_*`**: Mostrar como "Concluído" com visual atenuado (texto cinza, badge verde)
2. **Pagamentos todos `CONFIRMADO`**: Mostrar o grupo financeiro como "Quitado"
3. **Serviços ativos**: Manter o destaque visual atual

Isso não requer mudança no banco de dados, apenas lógica visual no frontend:

**Arquivo: `src/pages/crm/ContactDetail.tsx`**
- Para cada grupo de serviço/lead, verificar se o caso técnico associado tem status `ENCERRADO_*`
- Se sim, renderizar com estilo atenuado e badge "Concluído"
- Se todos os pagamentos do grupo são `CONFIRMADO`, mostrar badge "Quitado" ao lado do valor

Essa abordagem mantém o histórico visível mas deixa claro o que é passado e o que é atual, sem precisar de nenhum botão manual de "dar baixa".

