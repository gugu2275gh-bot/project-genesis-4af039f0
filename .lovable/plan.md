## 1. Excluir etapas — já é possível hoje

Duas formas, ambas já funcionando:

- **Editor visual**: clique na etapa no desenho → painel lateral direito → botão vermelho **"Excluir etapa"** (no fim do painel) → depois **"Salvar fluxo"** para gravar no banco.
- **Ver em tabela**: ícone de lixeira na linha da etapa (exclui imediatamente).

Melhorias que vou incluir para ficar óbvio:
- Botão de lixeira no próprio bloco do desenho (aparece ao passar o mouse) e tecla **Delete** com a etapa selecionada.
- Confirmação antes de excluir e aviso quando outras etapas apontam para a etapa removida (as ligações órfãs são limpas automaticamente).

## 2. Importar fluxo do Bizagi

Novo botão **"Importar do Bizagi"** na barra do editor visual, aceitando o arquivo **BPMN 2.0 (.bpmn / .xml)** exportado pelo Bizagi Modeler (Exportar → BPMN 2.0). O arquivo `.bpm` nativo do Bizagi não é legível — o diálogo explica isso e orienta a exportação correta.

Mapeamento aplicado na importação:

| Bizagi / BPMN | Vira no agente |
|---|---|
| Start Event | primeira etapa do fluxo |
| Task / User Task / Send Task | etapa (nome vira nome + `step_code` em snake_case) |
| Sequence Flow simples | próxima etapa (`next_step_code`) |
| Exclusive/Inclusive Gateway | ramificações da etapa anterior |
| Rótulo do fluxo saindo do gateway ("Sim", "Não", "Renovação"...) | condição da ramificação (tipo "contém") |
| End Event | etapa final (sem próxima) |
| Documentação/anotação do elemento | descrição da etapa |
| Posição (BPMNDiagram) | posição inicial dos blocos no canvas |

Fluxo de importação:
1. Escolher o arquivo → tela de **pré-visualização** listando etapas e ramificações detectadas, com alertas (elementos ignorados, gateways sem rótulo, nomes duplicados).
2. Escolher **Substituir tudo** ou **Adicionar ao fluxo atual**.
3. Confirmar → blocos são criados no canvas com auto-organização; nada é gravado até clicar em **"Salvar fluxo"**.
4. Perguntas/mensagens multi-idioma ficam em branco para você preencher (a estrutura vem do Bizagi, o conteúdo é do agente).

## Detalhes técnicos

- `src/lib/bizagi-bpmn-import.ts` (novo): parser BPMN via `DOMParser`, com namespaces `bpmn:`/`bpmn2:`/sem prefixo, resolvendo gateways em `branches`, gerando `step_code` únicos e mapeando `BPMNShape` → posições.
- `src/components/ai-agents/flow-builder/ImportBizagiDialog.tsx` (novo): upload, preview, modo substituir/adicionar.
- `src/components/ai-agents/flow-builder/FlowCanvas.tsx`: botão de importar, atalho Delete, limpeza de referências órfãs ao excluir.
- `src/components/ai-agents/flow-builder/StepNode.tsx`: botão de excluir no bloco.
- Sem mudanças de banco de dados nem no runtime do agente em produção.
