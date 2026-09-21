# Discriminar os serviços em cada item da fatura (PDF)

## O que muda

Hoje cada linha do quadro CONCEPTO mostra apenas o texto do item ("Pagamento avulso", "Parcela 1 - Contrato 92", "tasa"). Passa a mostrar, **logo abaixo de cada item**, uma linha por serviço vinculado àquela fatura, com o nome completo do serviço.

Regras:
- Um serviço → uma linha abaixo do item; dois, três ou mais → tantas linhas quantas necessárias.
- Cada item da fatura (serviço principal + taxas/custos extras) recebe a sua própria lista de serviços.
- Os valores (UNID., % DTO, ABONOS) continuam apenas na linha do item; as linhas de serviço são descritivas, sem valor, recuadas e em fonte menor.
- Se a fatura não tiver serviço identificado, nada é acrescentado (o item aparece como hoje).
- Nomes dos serviços em espanhol, como o resto da fatura.

## Exemplo visual

Antes (fatura 00011, dois itens):

```text
FECHA        CONCEPTO                        UNID.          % DTO    ABONOS
14/09/2026   Parcela 1 - Contrato 92         1     100,00            100,00
14/09/2026   tasa                            1      73,26             73,26
```

Depois:

```text
FECHA        CONCEPTO                                             UNID.         % DTO   ABONOS
14/09/2026   Parcela 1 - Contrato 92                              1    100,00           100,00
               · Certificado de antecedentes penales (en Brasil)
               · Renovación de residencia
14/09/2026   tasa                                                 1     73,26            73,26
               · Certificado de antecedentes penales (en Brasil)
```

Com um único serviço (fatura 00010):

```text
FECHA        CONCEPTO                                    UNID.         % DTO   ABONOS
14/09/2026   Pagamento avulso                            1    280,27           280,27
               · Nacionalidad por residencia
```

## Detalhes técnicos

- `src/lib/generate-invoice.ts`: adicionar `services?: string[]` em `InvoiceLineItem`; no laço de renderização das linhas, após imprimir a descrição, imprimir uma sub-linha por serviço (prefixo `· `, recuo ~4mm, fonte ~7pt, cor cinza) e aumentar a altura da linha conforme a quantidade de sub-linhas, mantendo o mínimo de 8 linhas do quadro e o alinhamento das bordas verticais/horizontais da tabela.
- `src/pages/finance/Invoices.tsx` (`handleDownload`, linhas ~85-173): buscar os serviços da fatura a partir do `contract_id` — lead principal (`opportunities.leads.service_types.name`) e leads adicionais (`contract_leads.leads.service_types.name`), com fallback para `service_interest`; sem duplicatas. Passar essa lista em `services` no item do serviço e nos itens de taxas extras.
- Nomes traduzidos para espanhol reusando o mesmo caminho de tradução já usado na geração de contratos.
