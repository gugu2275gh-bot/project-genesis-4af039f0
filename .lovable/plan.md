

# Plano: Corrigir Renderização dos Diagramas

## Problema Identificado

Os diagramas não estão sendo renderizados corretamente devido a:

1. **IDs do Mermaid conflitantes** - Quando a aba muda, o mesmo ID pode causar erro no Mermaid
2. **Verificação de innerHTML incorreta** - A condição `!innerHTML` pode impedir re-renderização após erros
3. **Estado de loading compartilhado** - Todos os diagramas usam o mesmo `isLoading`, causando comportamento incorreto

---

## Correções Necessárias

### 1. Usar IDs únicos por renderização

Gerar IDs dinâmicos com timestamp ou contador para evitar conflitos do Mermaid:

```typescript
// Antes
const { svg } = await mermaid.render('arch-diagram', code);

// Depois
const uniqueId = `arch-diagram-${Date.now()}`;
const { svg } = await mermaid.render(uniqueId, code);
```

### 2. Rastrear estado de renderização individualmente

Criar estado separado para cada diagrama:

```typescript
// Antes
const [isLoading, setIsLoading] = useState(true);

// Depois
const [loadingStates, setLoadingStates] = useState({
  erd: true,
  architecture: false,
  components: false,
  modules: false
});

const [renderedTabs, setRenderedTabs] = useState({
  erd: false,
  architecture: false,
  components: false,
  modules: false
});
```

### 3. Corrigir lógica de verificação de renderização

Substituir verificação de `innerHTML` por estado controlado:

```typescript
// Antes
if (activeTab === 'architecture' && !archContainerRef.current.innerHTML)

// Depois
if (activeTab === 'architecture' && !renderedTabs.architecture)
```

### 4. Limpar container antes de re-renderizar

Garantir que o container esteja limpo antes de nova renderização:

```typescript
const renderDiagram = async (type, containerRef, generateCode) => {
  if (!containerRef.current) return;
  
  // Limpar container
  containerRef.current.innerHTML = '';
  
  const uniqueId = `${type}-diagram-${Date.now()}`;
  const code = generateCode();
  const { svg } = await mermaid.render(uniqueId, code);
  containerRef.current.innerHTML = svg;
  
  // Marcar como renderizado
  setRenderedTabs(prev => ({ ...prev, [type]: true }));
};
```

---

## Arquivo a Modificar

| Arquivo | Ação |
|---------|------|
| `src/pages/settings/DatabaseERD.tsx` | **Modificar** - Corrigir lógica de renderização e IDs |

---

## Código Corrigido

```typescript
export default function DatabaseERD() {
  const [activeTab, setActiveTab] = useState('erd');
  const erdContainerRef = useRef<HTMLDivElement>(null);
  const archContainerRef = useRef<HTMLDivElement>(null);
  const compContainerRef = useRef<HTMLDivElement>(null);
  const modulesContainerRef = useRef<HTMLDivElement>(null);
  
  // Estados individuais de loading e renderização
  const [loadingStates, setLoadingStates] = useState({
    erd: true,
    architecture: false,
    components: false,
    modules: false
  });
  const [renderedTabs, setRenderedTabs] = useState({
    erd: false,
    architecture: false,
    components: false,
    modules: false
  });
  const [zooms, setZooms] = useState({ erd: 1, architecture: 1, components: 1, modules: 1 });

  const renderDiagram = useCallback(async (
    type: keyof typeof renderedTabs,
    containerRef: React.RefObject<HTMLDivElement>,
    generateCode: () => string
  ) => {
    if (!containerRef.current) return;
    
    try {
      // Marcar como loading
      setLoadingStates(prev => ({ ...prev, [type]: true }));
      
      // Limpar container
      containerRef.current.innerHTML = '';
      
      // Usar ID único para evitar conflitos
      const uniqueId = `${type}-diagram-${Date.now()}`;
      const code = generateCode();
      const { svg } = await mermaid.render(uniqueId, code);
      
      containerRef.current.innerHTML = svg;
      
      // Marcar como renderizado com sucesso
      setRenderedTabs(prev => ({ ...prev, [type]: true }));
      setLoadingStates(prev => ({ ...prev, [type]: false }));
    } catch (error) {
      console.error(`Error rendering ${type} diagram:`, error);
      toast.error(`Erro ao renderizar diagrama de ${type}`);
      setLoadingStates(prev => ({ ...prev, [type]: false }));
    }
  }, []);

  // Renderizar ERD inicial
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: {
        primaryColor: '#3B82F6',
        primaryTextColor: '#1F2937',
        primaryBorderColor: '#60A5FA',
        lineColor: '#9CA3AF',
        secondaryColor: '#F3F4F6',
        tertiaryColor: '#E5E7EB'
      },
      flowchart: {
        useMaxWidth: false,
        htmlLabels: true
      },
      er: {
        layoutDirection: 'TB',
        minEntityWidth: 100,
        minEntityHeight: 75,
        entityPadding: 15,
        useMaxWidth: false
      }
    });

    renderDiagram('erd', erdContainerRef, generateERDMermaidCode);
  }, [renderDiagram]);

  // Renderizar outros diagramas quando aba for selecionada
  useEffect(() => {
    if (activeTab === 'architecture' && !renderedTabs.architecture) {
      renderDiagram('architecture', archContainerRef, generateArchitectureMermaidCode);
    } else if (activeTab === 'components' && !renderedTabs.components) {
      renderDiagram('components', compContainerRef, generateComponentsMermaidCode);
    } else if (activeTab === 'modules' && !renderedTabs.modules) {
      renderDiagram('modules', modulesContainerRef, generateModulesMermaidCode);
    }
  }, [activeTab, renderedTabs, renderDiagram]);

  // Atualizar função de container para usar loading individual
  const renderDiagramContainer = (
    containerRef: React.RefObject<HTMLDivElement>, 
    tab: keyof typeof zooms
  ) => (
    <div className="overflow-auto border rounded-lg bg-white p-4" style={{ maxHeight: '70vh' }}>
      {loadingStates[tab] && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}
      <div 
        ref={containerRef}
        className="mermaid-container"
        style={{ 
          transform: `scale(${zooms[tab]})`,
          transformOrigin: 'top left',
          minHeight: loadingStates[tab] ? 0 : 'auto',
          display: loadingStates[tab] ? 'none' : 'block'
        }}
      />
    </div>
  );

  // ... resto do componente permanece igual
}
```

---

## Resumo das Mudanças

| Mudança | Benefício |
|---------|-----------|
| IDs únicos com timestamp | Evita conflitos do Mermaid |
| Estados de loading individuais | Cada diagrama tem seu próprio indicador |
| Estado de renderização por aba | Controle preciso sem depender de innerHTML |
| Limpar container antes de renderizar | Garante estado limpo |
| useCallback no renderDiagram | Evita re-criação desnecessária da função |

---

## Resultado Esperado

Após as correções:
- Aba **ERD**: Renderiza corretamente (já funciona)
- Aba **Arquitetura**: Renderiza o flowchart de camadas do sistema
- Aba **Componentes**: Renderiza o diagrama de estrutura React
- Aba **Módulos Funcionais**: Renderiza o fluxograma de módulos

Cada aba terá:
- Spinner de loading individual
- Controles de zoom funcionais
- Exportação PNG e SVG funcionando

