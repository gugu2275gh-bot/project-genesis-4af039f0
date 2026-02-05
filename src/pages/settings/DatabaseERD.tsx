import { useEffect, useRef, useState, useCallback } from 'react';
 import mermaid from 'mermaid';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, Database, ZoomIn, ZoomOut, RotateCcw, Server, Layers, GitBranch } from 'lucide-react';
import { 
  generateERDMermaidCode, 
  ERD_STATS, 
  ERD_MODULES,
  generateArchitectureMermaidCode,
  ARCHITECTURE_STATS,
  ARCHITECTURE_LAYERS,
  generateComponentsMermaidCode,
  COMPONENTS_STATS,
  COMPONENTS_CATEGORIES,
  generateModulesMermaidCode,
  MODULES_STATS,
  MODULES_INFO
} from '@/lib/generate-erd-diagram';
 import { toast } from 'sonner';
 
 export default function DatabaseERD() {
  const [activeTab, setActiveTab] = useState('erd');
  const erdContainerRef = useRef<HTMLDivElement>(null);
  const archContainerRef = useRef<HTMLDivElement>(null);
  const compContainerRef = useRef<HTMLDivElement>(null);
  const modulesContainerRef = useRef<HTMLDivElement>(null);
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
       setLoadingStates(prev => ({ ...prev, [type]: true }));
       
       // Clear container before rendering
       containerRef.current.innerHTML = '';
       
       // Use unique ID to avoid Mermaid conflicts
       const uniqueId = `${type}-diagram-${Date.now()}`;
       const code = generateCode();
       const { svg } = await mermaid.render(uniqueId, code);
       
       containerRef.current.innerHTML = svg;
       
       setRenderedTabs(prev => ({ ...prev, [type]: true }));
       setLoadingStates(prev => ({ ...prev, [type]: false }));
     } catch (error) {
       console.error(`Error rendering ${type} diagram:`, error);
       toast.error(`Erro ao renderizar diagrama de ${type}`);
       setLoadingStates(prev => ({ ...prev, [type]: false }));
     }
   }, []);
 
   // Initialize Mermaid and render ERD on mount
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
 
   // Render other diagrams when tab is selected
  useEffect(() => {
    if (activeTab === 'architecture' && !renderedTabs.architecture) {
      renderDiagram('architecture', archContainerRef, generateArchitectureMermaidCode);
    } else if (activeTab === 'components' && !renderedTabs.components) {
      renderDiagram('components', compContainerRef, generateComponentsMermaidCode);
    } else if (activeTab === 'modules' && !renderedTabs.modules) {
      renderDiagram('modules', modulesContainerRef, generateModulesMermaidCode);
    }
   }, [activeTab, renderedTabs, renderDiagram]);
 
  const handleDownloadPNG = async (containerRef: React.RefObject<HTMLDivElement>, filename: string) => {
     if (!containerRef.current) return;
     try {
       toast.loading('Gerando imagem PNG...', { id: 'download' });
       const svgElement = containerRef.current.querySelector('svg');
       if (!svgElement) {
         toast.error('Diagrama não encontrado', { id: 'download' });
         return;
       }
        const isExternalUrl = (url: string): boolean => {
          if (url.startsWith('data:') || url.startsWith('blob:')) return false;
          try {
            return new URL(url).origin !== window.location.origin;
          } catch {
            return false;
          }
        };

        const loadImage = (imageUrl: string) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            // CRITICAL: set crossOrigin BEFORE src for external images
            if (isExternalUrl(imageUrl)) {
              img.crossOrigin = 'anonymous';
            }
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load image: ${imageUrl}`));
            img.src = imageUrl;
          });

        const canvasToBlob = (canvas: HTMLCanvasElement) =>
          new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (blob) => {
                if (!blob) return reject(new Error('Failed to generate PNG blob'));
                resolve(blob);
              },
              'image/png',
              1.0,
            );
          });

        const getSvgExportBox = (svg: SVGElement) => {
          const padding = 50;

          // Prefer bbox if available (best for diagrams larger than viewport)
          try {
            const bbox = (svg as unknown as SVGGraphicsElement).getBBox();
            if (bbox && bbox.width > 0 && bbox.height > 0) {
              return {
                x: bbox.x - padding,
                y: bbox.y - padding,
                width: bbox.width + padding * 2,
                height: bbox.height + padding * 2,
              };
            }
          } catch {
            // ignore
          }

          // Fallback to viewBox
          const vb = (svg as SVGSVGElement).viewBox?.baseVal;
          if (vb && vb.width > 0 && vb.height > 0) {
            return {
              x: vb.x,
              y: vb.y,
              width: vb.width,
              height: vb.height,
            };
          }

          // Fallback to DOM rect
          const rect = svg.getBoundingClientRect();
          return {
            x: 0,
            y: 0,
            width: Math.max(1920, Math.ceil(rect.width) || 1920),
            height: Math.max(1080, Math.ceil(rect.height) || 1080),
          };
        };

        const exportBox = getSvgExportBox(svgElement);

        const clonedSvg = svgElement.cloneNode(true) as SVGElement;
        clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        clonedSvg.setAttribute('viewBox', `${exportBox.x} ${exportBox.y} ${exportBox.width} ${exportBox.height}`);
        clonedSvg.setAttribute('width', String(Math.ceil(exportBox.width)));
        clonedSvg.setAttribute('height', String(Math.ceil(exportBox.height)));

        const svgData = new XMLSerializer().serializeToString(clonedSvg);
        // Use Data URL instead of Blob URL to avoid tainted canvas security error
        const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));
        const svgDataUrl = `data:image/svg+xml;base64,${svgBase64}`;

        try {
          const img = await loadImage(svgDataUrl);
          const scale = 2;
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth * scale;
          canvas.height = img.naturalHeight * scale;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            toast.error('Erro ao criar canvas', { id: 'download' });
            return;
          }

          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.scale(scale, scale);
          ctx.drawImage(img, 0, 0);

          const pngBlob = await canvasToBlob(canvas);
          const url = URL.createObjectURL(pngBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `CB_Asesoria_${filename}_${new Date().toISOString().split('T')[0]}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.success('Diagrama exportado com sucesso!', { id: 'download' });
        } catch (innerError) {
          console.error('Error in PNG generation:', innerError);
          toast.error('Erro ao gerar PNG', { id: 'download' });
        }
     } catch (error) {
       console.error('Error downloading PNG:', error);
       toast.error('Erro ao baixar imagem PNG', { id: 'download' });
     }
   };
 
  const handleDownloadSVG = (containerRef: React.RefObject<HTMLDivElement>, filename: string) => {
     if (!containerRef.current) return;
     const svgElement = containerRef.current.querySelector('svg');
     if (!svgElement) {
       toast.error('Diagrama não encontrado');
       return;
     }
     const clonedSvg = svgElement.cloneNode(true) as SVGElement;
     clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
     const svgData = new XMLSerializer().serializeToString(clonedSvg);
     const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
     const url = URL.createObjectURL(blob);
     const a = document.createElement('a');
     a.href = url;
    a.download = `CB_Asesoria_${filename}_${new Date().toISOString().split('T')[0]}.svg`;
     document.body.appendChild(a);
     a.click();
     document.body.removeChild(a);
     URL.revokeObjectURL(url);
     toast.success('Diagrama SVG exportado!');
   };
 
  const handleZoom = (tab: keyof typeof zooms, delta: number) => {
    setZooms(prev => ({
      ...prev,
      [tab]: Math.max(0.25, Math.min(2, prev[tab] + delta))
    }));
  };

  const resetZoom = (tab: keyof typeof zooms) => {
    setZooms(prev => ({ ...prev, [tab]: 1 }));
  };

  const renderZoomControls = (tab: keyof typeof zooms, containerRef: React.RefObject<HTMLDivElement>, filename: string) => (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 border rounded-md">
        <Button variant="ghost" size="icon" onClick={() => handleZoom(tab, -0.25)}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-sm w-12 text-center">{Math.round(zooms[tab] * 100)}%</span>
        <Button variant="ghost" size="icon" onClick={() => handleZoom(tab, 0.25)}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => resetZoom(tab)}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
      <Button variant="outline" onClick={() => handleDownloadSVG(containerRef, filename)}>
        <Download className="mr-2 h-4 w-4" />
        SVG
      </Button>
      <Button onClick={() => handleDownloadPNG(containerRef, filename)}>
        <Download className="mr-2 h-4 w-4" />
        PNG
      </Button>
    </div>
  );

  const renderDiagramContainer = (containerRef: React.RefObject<HTMLDivElement>, tab: keyof typeof zooms) => (
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

   return (
     <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="erd" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            ERD Banco de Dados
          </TabsTrigger>
          <TabsTrigger value="architecture" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            Arquitetura
          </TabsTrigger>
          <TabsTrigger value="components" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Componentes
          </TabsTrigger>
          <TabsTrigger value="modules" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Módulos Funcionais
          </TabsTrigger>
        </TabsList>
 
        {/* ERD Tab */}
        <TabsContent value="erd" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{ERD_STATS.tables}</div>
                <p className="text-sm text-muted-foreground">Tabelas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{ERD_STATS.relationships}</div>
                <p className="text-sm text-muted-foreground">Relacionamentos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{ERD_STATS.foreignKeys}</div>
                <p className="text-sm text-muted-foreground">Foreign Keys</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{ERD_STATS.rlsPolicies}+</div>
                <p className="text-sm text-muted-foreground">Políticas RLS</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{ERD_STATS.modules}</div>
                <p className="text-sm text-muted-foreground">Módulos</p>
              </CardContent>
            </Card>
           </div>
 
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="h-5 w-5" />
                Legenda por Módulo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {ERD_MODULES.map((module) => (
                  <div key={module.name} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: module.color }} />
                    <span className="text-sm font-medium">{module.name}</span>
                    <span className="text-xs text-muted-foreground">({module.tables.length} tabelas)</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Diagrama ERD - Banco de Dados</CardTitle>
                  <CardDescription>Visualização completa da estrutura relacional do sistema</CardDescription>
                </div>
                {renderZoomControls('erd', erdContainerRef, 'ERD')}
              </div>
            </CardHeader>
            <CardContent>
              {renderDiagramContainer(erdContainerRef, 'erd')}
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ERD_MODULES.map((module) => (
              <Card key={module.name}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: module.color }} />
                    Módulo {module.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm space-y-1">
                    {module.tables.map((table) => (
                      <li key={table} className="text-muted-foreground font-mono text-xs">• {table}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
           </div>
        </TabsContent>

        {/* Architecture Tab */}
        <TabsContent value="architecture" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{ARCHITECTURE_STATS.layers}</div>
                <p className="text-sm text-muted-foreground">Camadas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{ARCHITECTURE_STATS.edgeFunctions}</div>
                <p className="text-sm text-muted-foreground">Edge Functions</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{ARCHITECTURE_STATS.supabaseServices}</div>
                <p className="text-sm text-muted-foreground">Serviços Supabase</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{ARCHITECTURE_STATS.externalIntegrations}</div>
                <p className="text-sm text-muted-foreground">Integrações</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{ARCHITECTURE_STATS.frontendLibs}</div>
                <p className="text-sm text-muted-foreground">Libs Frontend</p>
              </CardContent>
            </Card>
           </div>
 
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Server className="h-5 w-5" />
                Legenda por Camada
               </CardTitle>
             </CardHeader>
             <CardContent>
              <div className="flex flex-wrap gap-4">
                {ARCHITECTURE_LAYERS.map((layer) => (
                  <div key={layer.name} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: layer.color }} />
                    <span className="text-sm font-medium">{layer.name}</span>
                    <span className="text-xs text-muted-foreground">({layer.items.length} itens)</span>
                  </div>
                 ))}
              </div>
             </CardContent>
           </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Arquitetura do Sistema</CardTitle>
                  <CardDescription>Stack técnica e fluxo de dados entre camadas</CardDescription>
                </div>
                {renderZoomControls('architecture', archContainerRef, 'Arquitetura')}
              </div>
            </CardHeader>
            <CardContent>
              {renderDiagramContainer(archContainerRef, 'architecture')}
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ARCHITECTURE_LAYERS.map((layer) => (
              <Card key={layer.name}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: layer.color }} />
                    {layer.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm space-y-1">
                    {layer.items.map((item) => (
                      <li key={item} className="text-muted-foreground font-mono text-xs">• {item}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Components Tab */}
        <TabsContent value="components" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{COMPONENTS_STATS.pages}+</div>
                <p className="text-sm text-muted-foreground">Páginas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{COMPONENTS_STATS.components}+</div>
                <p className="text-sm text-muted-foreground">Componentes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{COMPONENTS_STATS.hooks}+</div>
                <p className="text-sm text-muted-foreground">Hooks</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{COMPONENTS_STATS.uiComponents}+</div>
                <p className="text-sm text-muted-foreground">UI Components</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{COMPONENTS_STATS.contexts}</div>
                <p className="text-sm text-muted-foreground">Contexts</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{COMPONENTS_STATS.languages}</div>
                <p className="text-sm text-muted-foreground">Idiomas</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Legenda por Categoria
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {COMPONENTS_CATEGORIES.map((cat) => (
                  <div key={cat.name} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: cat.color }} />
                    <span className="text-sm font-medium">{cat.name}</span>
                    <span className="text-xs text-muted-foreground">({cat.count}+)</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Diagrama de Componentes</CardTitle>
                  <CardDescription>Estrutura de alto nível dos componentes React</CardDescription>
                </div>
                {renderZoomControls('components', compContainerRef, 'Componentes')}
              </div>
            </CardHeader>
            <CardContent>
              {renderDiagramContainer(compContainerRef, 'components')}
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {COMPONENTS_CATEGORIES.map((cat) => (
              <Card key={cat.name}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: cat.color }} />
                    {cat.name} ({cat.count}+)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm space-y-1">
                    {cat.items.map((item) => (
                      <li key={item} className="text-muted-foreground font-mono text-xs">• {item}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Modules Tab */}
        <TabsContent value="modules" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{MODULES_STATS.modules}</div>
                <p className="text-sm text-muted-foreground">Módulos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{MODULES_STATS.journeyPhases}</div>
                <p className="text-sm text-muted-foreground">Fases da Jornada</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{MODULES_STATS.tables}</div>
                <p className="text-sm text-muted-foreground">Tabelas</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{MODULES_STATS.automations}</div>
                <p className="text-sm text-muted-foreground">Automações</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-primary">{MODULES_STATS.integrations}</div>
                <p className="text-sm text-muted-foreground">Integrações</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Legenda por Módulo Funcional
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {MODULES_INFO.map((mod) => (
                  <div key={mod.name} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: mod.color }} />
                    <span className="text-sm font-medium">{mod.name}</span>
                    <span className="text-xs text-muted-foreground">({mod.tables} tabelas)</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Documentação Funcional dos Módulos</CardTitle>
                  <CardDescription>Fluxo operacional entre os módulos do sistema</CardDescription>
                </div>
                {renderZoomControls('modules', modulesContainerRef, 'Modulos')}
              </div>
            </CardHeader>
            <CardContent>
              {renderDiagramContainer(modulesContainerRef, 'modules')}
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {MODULES_INFO.map((mod) => (
              <Card key={mod.name}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: mod.color }} />
                    Módulo {mod.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{mod.description}</p>
                  <p className="text-xs text-muted-foreground mt-2 font-mono">{mod.tables} tabelas relacionadas</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
     </div>
   );
 }