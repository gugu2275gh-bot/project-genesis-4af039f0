// @ts-nocheck
// Validador de cidades espanholas (municípios INE 2025).
// O JSON contém ~8.7k nomes normalizados (sem acento, lowercase, com aliases co-oficiais).
import cities from './spanish-cities.json' with { type: 'json' }

const CITY_SET: Set<string> = new Set(cities as string[])

export function normalizeCity(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Stop-words em PT/ES/EN/FR que aparecem antes do nome da cidade
const PREFIX_RE = /^(en|em|na|no|a|the|de|del|do|da|dans|à|en la|en el|estoy en|estoy empadronado en|moro em|vivo en|vivo em|i live in|i am in|residence in|residencia en|empadronado en|empadronado em|empadronada en|empadronada em)\s+/i

export function extractCityFromAnswer(text: string): string | null {
  let raw = String(text || '').trim()
  if (!raw) return null
  // remove pontuação final
  raw = raw.replace(/[.,!?;:"']+$/g, '')
  // tira prefixos comuns
  raw = raw.replace(PREFIX_RE, '')
  // se respondeu com várias cidades ("barcelona, madrid"), pega a primeira
  raw = raw.split(/[,\/]| y | e | and | et /i)[0].trim()
  return raw || null
}

// Capitais/cidades estrangeiras conhecidas — rejeição explícita mesmo se um dia
// algum nome ambíguo entrar no dataset INE.
const FOREIGN_CITY_BLACKLIST: Set<string> = new Set([
  'paris', 'lisboa', 'lisbon', 'porto', 'londres', 'london', 'roma', 'rome',
  'milao', 'milan', 'milano', 'berlim', 'berlin', 'munique', 'munich',
  'amsterda', 'amsterdam', 'bruxelas', 'brussels', 'bruxelles', 'viena', 'vienna',
  'dublin', 'edimburgo', 'edinburgh', 'manchester', 'liverpool',
  'nova york', 'new york', 'los angeles', 'miami', 'chicago', 'boston', 'houston',
  'buenos aires', 'cordoba', 'rosario', 'santiago', 'lima', 'quito', 'bogota',
  'caracas', 'la paz', 'asuncion', 'montevideu', 'montevideo',
  'cidade do mexico', 'ciudad de mexico', 'mexico df', 'mexico',
  'rio de janeiro', 'sao paulo', 'brasilia', 'salvador', 'fortaleza', 'recife',
  'belo horizonte', 'curitiba', 'manaus', 'belem', 'goiania', 'natal',
  'florianopolis', 'porto alegre', 'campinas', 'vitoria', 'cuiaba',
  'tokyo', 'toquio', 'pequim', 'beijing', 'xangai', 'shanghai',
  'sydney', 'melbourne', 'auckland', 'wellington',
  'casablanca', 'tunis', 'cairo', 'el cairo', 'rabat',
])

export function isValidSpanishCity(text: string): boolean {
  const city = extractCityFromAnswer(text)
  if (!city) return false
  const n = normalizeCity(city)
  if (!n) return false
  if (FOREIGN_CITY_BLACKLIST.has(n)) return false
  if (CITY_SET.has(n)) return true
  // tenta sem artigo inicial
  const noArt = n.replace(/^(el|la|los|las|els|les|lo|os|as|a|o|l|ses)\s+/, '')
  if (!noArt) return false
  if (FOREIGN_CITY_BLACKLIST.has(noArt)) return false
  if (CITY_SET.has(noArt)) return true
  return false
}
