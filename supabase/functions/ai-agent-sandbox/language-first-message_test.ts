import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { detectFlowLanguageOrNull, resolveFlowLanguage } from "../_shared/language-detect.ts";

Deno.test("1ª mensagem em cada idioma é detectada imediatamente", () => {
  assertEquals(detectFlowLanguageOrNull("Hola, buenas tardes"), "es");
  assertEquals(detectFlowLanguageOrNull("Hola"), "es");
  assertEquals(detectFlowLanguageOrNull("Oi, tudo bem?"), "pt-BR");
  assertEquals(detectFlowLanguageOrNull("Hello, good morning"), "en");
  assertEquals(detectFlowLanguageOrNull("Bonjour, j'ai besoin d'aide"), "fr");
});

Deno.test("mensagem neutra não trava idioma", () => {
  const r = resolveFlowLanguage(undefined, "12345", "pt-BR");
  assertEquals(r.locked, false);
  assertEquals(r.lang, "pt-BR");
});

Deno.test("saudação na 1ª mensagem trava e usa idioma detectado", () => {
  const r = resolveFlowLanguage(undefined, "Hello there", "pt-BR");
  assertEquals(r.locked, true);
  assertEquals(r.lang, "en");
});

Deno.test("idioma travado não é redetectado", () => {
  const r = resolveFlowLanguage("es", "Hello there", "pt-BR");
  assertEquals(r.lang, "es");
  assertEquals(r.locked, true);
});
