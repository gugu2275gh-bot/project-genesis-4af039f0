import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts"
import { applyVars, buildFlowVars, pickFieldValue } from "./flow-vars.ts"
import { prefillFromFieldValues } from "./flow-intake.ts"

Deno.test("variavel some quando nao ha valor", () => {
  assertEquals(applyVars("Olá, {nome}! Tudo bem?", {}), "Olá! Tudo bem?")
  assertEquals(applyVars("Olá, {nome}!", { nome: "Ana" }), "Olá, Ana!")
})

Deno.test("apelidos de campo", () => {
  assertEquals(pickFieldValue({ "outside.eu_family": "sim" }, "contact.has_eu_family_member"), "sim")
  assertEquals(buildFlowVars({ "contact.full_name": "Rose Carla Santos" }).nome, "Rose")
})

Deno.test("pergunta geral e satisfeita por N campos", () => {
  const steps: any[] = [{
    step_code: "abertura_geral", step_type: "PERGUNTA", order_index: 0,
    validation: { step_kind: "PERGUNTA_GERAL", general_capture: { enabled: true, min_fields: 2, fields: [
      { source: "idade", target_field: "outside.age" },
      { source: "cidade", target_field: "funnel.empadronado_city" },
      { source: "objetivo", target_field: "funnel.interest_confirmed" },
    ] } },
  }]
  const pre = prefillFromFieldValues(steps, { "outside.age": "34", "contact.city": "Valencia" })
  assertEquals(Object.keys(pre), ["abertura_geral"])
  assertEquals(Object.keys(prefillFromFieldValues(steps, { "outside.age": "34" })).length, 0)
})
