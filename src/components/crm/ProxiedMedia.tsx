import { useProxiedMedia } from '@/lib/media-proxy';
import { Download, ExternalLink, FileText, Mic, Loader2 } from 'lucide-react';

interface ProxiedMediaProps {
  mediaUrl: string;
  mediaType: string | null;
  mediaMimetype: string | null;
  mediaFilename: string | null;
}

export function ProxiedMedia({ mediaUrl, mediaType, mediaMimetype, mediaFilename }: ProxiedMediaProps) {
  const { url, loading } = useProxiedMedia(mediaUrl);

  if (loading || !url) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Carregando mídia...</span>
      </div>
    );
  }

  if (mediaType === 'image' || mediaType === 'sticker' || mediaMimetype?.startsWith('image/')) {
    return (
      <>
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img
            src={url}
            alt="Imagem recebida"
            className="max-w-[240px] rounded-md cursor-pointer hover:opacity-90 transition"
            loading="lazy"
          />
        </a>
        <div className="flex items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground underline underline-offset-2"
          >
            <ExternalLink className="h-3 w-3" />
            Visualizar
          </a>
          <a
            href={url}
            download={mediaFilename || 'imagem'}
            className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground underline underline-offset-2"
          >
            <Download className="h-3 w-3" />
            Baixar
          </a>
        </div>
      </>
    );
  }

  if (mediaType === 'video') {
    return (
      <>
        <video src={url} controls className="max-w-[240px] rounded-md" />
        <div className="flex items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground underline underline-offset-2"
          >
            <ExternalLink className="h-3 w-3" />
            Abrir em nova aba
          </a>
          <a
            href={url}
            download={mediaFilename || 'video'}
            className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground underline underline-offset-2"
          >
            <Download className="h-3 w-3" />
            Baixar
          </a>
        </div>
      </>
    );
  }

  if (mediaType === 'audio' || mediaType === 'ptt') {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/70 mb-1">
          <Mic className="h-3.5 w-3.5" />
          <span>{mediaType === 'ptt' ? 'Nota de voz' : 'Áudio'}</span>
        </div>
        <audio src={url} controls className="max-w-[240px]" />
        <a
          href={url}
          download={mediaFilename || 'audio'}
          className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground underline underline-offset-2"
        >
          <Download className="h-3 w-3" />
          Baixar áudio
        </a>
      </div>
    );
  }

  if (mediaType === 'document') {
    return (
      <div className="space-y-1">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-background/50 rounded-md p-2 hover:bg-background/80 transition"
        >
          <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          <span className="text-sm truncate">{mediaFilename || 'Documento'}</span>
          <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0 ml-auto" />
        </a>
        <a
          href={url}
          download={mediaFilename || 'documento'}
          className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground underline underline-offset-2"
        >
          <Download className="h-3 w-3" />
          Baixar documento
        </a>
      </div>
    );
  }

  // Fallback for unknown media types
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
    >
      <ExternalLink className="h-3 w-3" />
      {mediaFilename || 'Abrir mídia'}
    </a>
  );
}
