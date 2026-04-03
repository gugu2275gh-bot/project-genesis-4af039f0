import { useState, useEffect } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/integrations/supabase/client';

const cache = new Map<string, string>();

/**
 * Returns true if the URL needs proxying (Twilio API URLs require auth)
 */
function needsProxy(url: string): boolean {
  return url.includes('api.twilio.com');
}

/**
 * Fetches a Twilio media URL through our proxy edge function
 * and returns a local blob URL for the browser to use.
 */
export async function getProxiedMediaUrl(mediaUrl: string): Promise<string> {
  if (!mediaUrl) return mediaUrl;
  if (!needsProxy(mediaUrl)) return mediaUrl;
  if (cache.has(mediaUrl)) return cache.get(mediaUrl)!;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/twilio-media-proxy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ mediaUrl }),
      }
    );

    if (!response.ok) {
      console.error('Media proxy failed:', response.status);
      return mediaUrl;
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    cache.set(mediaUrl, blobUrl);
    return blobUrl;
  } catch (err) {
    console.error('Media proxy error:', err);
    return mediaUrl;
  }
}

/**
 * React hook that returns a proxied blob URL for a Twilio media URL.
 * For non-Twilio URLs, returns the original URL immediately.
 */
export function useProxiedMedia(mediaUrl: string | null | undefined): { url: string | null; loading: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!mediaUrl) {
      setUrl(null);
      return;
    }

    if (!needsProxy(mediaUrl)) {
      setUrl(mediaUrl);
      return;
    }

    if (cache.has(mediaUrl)) {
      setUrl(cache.get(mediaUrl)!);
      return;
    }

    setLoading(true);
    getProxiedMediaUrl(mediaUrl).then((proxied) => {
      setUrl(proxied);
      setLoading(false);
    });
  }, [mediaUrl]);

  return { url, loading };
}
