import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { resolveServiceType } from '../_shared/service-catalog.ts'

const ROWS = [
  { id: 'a', code: 'VISTO_ESTUDANTE', name: 'Visto de Estudante', is_active: true },
  { id: 'b', code: 'NACIONALIDADE_RESIDENCIA', name: 'Nacionalidade por Residência', is_active: true },
  { id: 'c', code: 'RENOVACAO_RESIDENCIA', name: 'Renovação de Residência', is_active: true },
]

function fakeSupabase(rows = ROWS) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: rows }) }),
      }),
    }),
  }
}

Deno.test('casa o serviço pelo nome do catálogo', async () => {
  const match = await resolveServiceType(fakeSupabase(), 'quero visto de estudante para um mestrado')
  assertEquals(match?.service_type_id, 'a')
  assertEquals(match?.service_interest, 'VISTO_ESTUDANTE')
})

Deno.test('casa pelo objetivo quando o nome não aparece', async () => {
  const match = await resolveServiceType(fakeSupabase(), 'quero morar na Espanha')
  assertEquals(match?.service_type_id, 'c')
})

Deno.test('texto vago não resolve serviço', async () => {
  assertEquals(await resolveServiceType(fakeSupabase(), 'oi'), null)
  assertEquals(await resolveServiceType(fakeSupabase(), 'preciso de ajuda'), null)
})

Deno.test('catálogo vazio nunca inventa serviço', async () => {
  assertEquals(await resolveServiceType(fakeSupabase([]), 'quero visto de estudante'), null)
})
