 import { useEffect, useRef, useState } from 'react';
 import mermaid from 'mermaid';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Download, Database, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
 import { generateERDMermaidCode, ERD_STATS, ERD_MODULES } from '@/lib/generate-erd-diagram';
 import { toast } from 'sonner';
 
 export default function DatabaseERD() {
   const containerRef = useRef<HTMLDivElement>(null);
   const [isLoading, setIsLoading] = useState(true);
   const [zoom, setZoom] = useState(1);
 
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
       er: {
         layoutDirection: 'TB',
         minEntityWidth: 100,
         minEntityHeight: 75,
         entityPadding: 15,
         useMaxWidth: false
       }
     });
 
     renderDiagram();
   }, []);
 
   const renderDiagram = async () => {
     if (!containerRef.current) return;
     
     try {
       setIsLoading(true);
       const code = generateERDMermaidCode();
       const { svg } = await mermaid.render('erd-diagram', code);
       containerRef.current.innerHTML = svg;
       setIsLoading(false);
     } catch (error) {
       console.error('Error rendering ERD:', error);
       toast.error('Erro ao renderizar diagrama ERD');
       setIsLoading(false);
     }
   };
 
   const handleDownloadPNG = async () => {
     if (!containerRef.current) return;
     
     try {
       toast.loading('Gerando imagem PNG...', { id: 'download' });
       
       const svgElement = containerRef.current.querySelector('svg');
       if (!svgElement) {
         toast.error('Diagrama não encontrado', { id: 'download' });
         return;
       }
 
       // Clone and prepare SVG
       const clonedSvg = svgElement.cloneNode(true) as SVGElement;
       clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
       
       // Get SVG dimensions
       const bbox = svgElement.getBBox();
       const width = Math.max(bbox.width + 100, 1920);
       const height = Math.max(bbox.height + 100, 1080);
       
       clonedSvg.setAttribute('width', String(width));
       clonedSvg.setAttribute('height', String(height));
       
       // Convert to data URL
       const svgData = new XMLSerializer().serializeToString(clonedSvg);
       const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
       const svgUrl = URL.createObjectURL(svgBlob);
       
       // Create canvas and draw
       const img = new Image();
       img.onload = () => {
         const canvas = document.createElement('canvas');
         canvas.width = width * 2; // 2x for high resolution
         canvas.height = height * 2;
         
         const ctx = canvas.getContext('2d');
         if (!ctx) {
           toast.error('Erro ao criar canvas', { id: 'download' });
           return;
         }
         
         // White background
         ctx.fillStyle = '#FFFFFF';
         ctx.fillRect(0, 0, canvas.width, canvas.height);
         
         // Scale for high resolution
         ctx.scale(2, 2);
         ctx.drawImage(img, 50, 50);
         
         // Download
         canvas.toBlob((blob) => {
           if (!blob) {
             toast.error('Erro ao gerar imagem', { id: 'download' });
             return;
           }
           
           const url = URL.createObjectURL(blob);
           const a = document.createElement('a');
           a.href = url;
           a.download = `CB_Asesoria_ERD_${new Date().toISOString().split('T')[0]}.png`;
           document.body.appendChild(a);
           a.click();
           document.body.removeChild(a);
           URL.revokeObjectURL(url);
           URL.revokeObjectURL(svgUrl);
           
           toast.success('Diagrama ERD exportado com sucesso!', { id: 'download' });
         }, 'image/png', 1.0);
       };
       
       img.onerror = () => {
         toast.error('Erro ao carregar imagem', { id: 'download' });
         URL.revokeObjectURL(svgUrl);
       };
       
       img.src = svgUrl;
     } catch (error) {
       console.error('Error downloading PNG:', error);
       toast.error('Erro ao baixar imagem PNG', { id: 'download' });
     }
   };
 
   const handleDownloadSVG = () => {
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
     a.download = `CB_Asesoria_ERD_${new Date().toISOString().split('T')[0]}.svg`;
     document.body.appendChild(a);
     a.click();
     document.body.removeChild(a);
     URL.revokeObjectURL(url);
     
     toast.success('Diagrama SVG exportado!');
   };
 
   return (
     <div className="space-y-6">
       {/* Stats Cards */}
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
 
       {/* Legend */}
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
                 <div 
                   className="w-4 h-4 rounded" 
                   style={{ backgroundColor: module.color }}
                 />
                 <span className="text-sm font-medium">{module.name}</span>
                 <span className="text-xs text-muted-foreground">({module.tables.length} tabelas)</span>
               </div>
             ))}
           </div>
         </CardContent>
       </Card>
 
       {/* Diagram */}
       <Card>
         <CardHeader>
           <div className="flex items-center justify-between">
             <div>
               <CardTitle>Diagrama ERD - Banco de Dados</CardTitle>
               <CardDescription>
                 Visualização completa da estrutura relacional do sistema CB Asesoría
               </CardDescription>
             </div>
             <div className="flex items-center gap-2">
               <div className="flex items-center gap-1 border rounded-md">
                 <Button 
                   variant="ghost" 
                   size="icon"
                   onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}
                 >
                   <ZoomOut className="h-4 w-4" />
                 </Button>
                 <span className="text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
                 <Button 
                   variant="ghost" 
                   size="icon"
                   onClick={() => setZoom(z => Math.min(2, z + 0.25))}
                 >
                   <ZoomIn className="h-4 w-4" />
                 </Button>
                 <Button 
                   variant="ghost" 
                   size="icon"
                   onClick={() => setZoom(1)}
                 >
                   <RotateCcw className="h-4 w-4" />
                 </Button>
               </div>
               <Button variant="outline" onClick={handleDownloadSVG}>
                 <Download className="mr-2 h-4 w-4" />
                 SVG
               </Button>
               <Button onClick={handleDownloadPNG}>
                 <Download className="mr-2 h-4 w-4" />
                 PNG
               </Button>
             </div>
           </div>
         </CardHeader>
         <CardContent>
           <div 
             className="overflow-auto border rounded-lg bg-white p-4"
             style={{ maxHeight: '70vh' }}
           >
             {isLoading && (
               <div className="flex items-center justify-center h-64">
                 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
               </div>
             )}
             <div 
               ref={containerRef}
               className="mermaid-container"
               style={{ 
                 transform: `scale(${zoom})`,
                 transformOrigin: 'top left',
                 minHeight: isLoading ? 0 : 'auto'
               }}
             />
           </div>
         </CardContent>
       </Card>
 
       {/* Module Details */}
       <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
         {ERD_MODULES.map((module) => (
           <Card key={module.name}>
             <CardHeader className="pb-2">
               <CardTitle className="text-base flex items-center gap-2">
                 <div 
                   className="w-3 h-3 rounded" 
                   style={{ backgroundColor: module.color }}
                 />
                 Módulo {module.name}
               </CardTitle>
             </CardHeader>
             <CardContent>
               <ul className="text-sm space-y-1">
                 {module.tables.map((table) => (
                   <li key={table} className="text-muted-foreground font-mono text-xs">
                     • {table}
                   </li>
                 ))}
               </ul>
             </CardContent>
           </Card>
         ))}
       </div>
     </div>
   );
 }