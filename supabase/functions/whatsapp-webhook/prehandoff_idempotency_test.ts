// Tests for stripRepeatedPreHandoff: prevents H1/H2/H3 re-emission after handoff sent.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { stripRepeatedPreHandoff, stripLockedSentinel } from './lib/overrides.ts'

const FULL_BLOCK_ES =
  'Perfecto, ya puedo tener una visión inicial de tu caso.\n\nEn CB analizamos cada caso de forma individual, siempre buscando el camino más seguro y dentro de la ley.\n\nVoy a remitir tu información a un especialista para que la analice con más profundidad.'

Deno.test('preHandoffSent=false: passa intacto', () => {
  const out = stripRepeatedPreHandoff(FULL_BLOCK_ES, 'es', { preHandoffSent: false })
  assertEquals(out, FULL_BLOCK_ES)
})

Deno.test('preHandoffSent=true + bloco completo (es): substitui pelo sufixo pós-handoff', () => {
  const out = stripLockedSentinel(stripRepeatedPreHandoff(FULL_BLOCK_ES, 'es', { preHandoffSent: true }))
  assert(/en breve uno de nuestros especialistas/i.test(out), `got: ${out}`)
  assert(!/visi[óo]n inicial/i.test(out))
})

Deno.test('preHandoffSent=true + só H1 (pt-BR): vira sufixo pós-handoff', () => {
  const out = stripLockedSentinel(stripRepeatedPreHandoff(
    'Perfeito. Já consigo ter uma visão inicial do seu caso.',
    'pt-BR',
    { preHandoffSent: true },
  ))
  assert(/em breve um de nossos especialistas/i.test(out), `got: ${out}`)
})

Deno.test('preHandoffSent=true + KB + H1 colado (pt-BR): mantém só KB', () => {
  const hybrid = 'O visado de estudante exige matrícula em escola homologada.\n\nPerfeito. Já consigo ter uma visão inicial do seu caso.'
  const out = stripLockedSentinel(stripRepeatedPreHandoff(hybrid, 'pt-BR', { preHandoffSent: true }))
  assert(/visado de estudante/i.test(out))
  assert(!/vis[ãa]o inicial/i.test(out), `got: ${out}`)
})

Deno.test('preHandoffSent=true + bolhas |||: filtra cada bolha', () => {
  const payload = `Perfecto. Ya puedo tener una visión inicial de tu caso.|||En CB analizamos cada caso de forma individual.|||Voy a remitir tu información a un especialista.`
  const out = stripLockedSentinel(stripRepeatedPreHandoff(payload, 'es', { preHandoffSent: true }))
  assert(/en breve uno de nuestros especialistas/i.test(out))
})

Deno.test('preHandoffSent=true + EN bloco completo: vira sufixo EN', () => {
  const en = 'Perfect. I can already get an initial view of your case.\n\nAt CB we analyze each case individually, always looking for the safest path within the law.\n\nI will forward your information to a specialist to analyze it in more depth.'
  const out = stripLockedSentinel(stripRepeatedPreHandoff(en, 'en', { preHandoffSent: true }))
  assert(/one of our specialists/i.test(out), `got: ${out}`)
})

Deno.test('preHandoffSent=true + FR bloco completo: vira sufixo FR', () => {
  const fr = 'Parfait. Je peux déjà avoir une première vision de votre cas.\n\nChez CB, nous analysons chaque cas individuellement.\n\nJe vais transmettre vos informations à un spécialiste.'
  const out = stripLockedSentinel(stripRepeatedPreHandoff(fr, 'fr', { preHandoffSent: true }))
  assert(/un de nos sp[ée]cialistes/i.test(out), `got: ${out}`)
})
