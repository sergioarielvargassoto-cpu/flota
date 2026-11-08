/** Uso: npm test  (node --test, Node ≥ 22.18 ejecuta TypeScript sin dependencias) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETA, SERIES, contraste, formatoMontoCorto, indiceMaximo, variacion } from '../src/lib/graficos.ts';

test('contraste: valores de referencia WCAG', () => {
  assert.equal(Math.round(contraste('#000000', '#ffffff') * 100) / 100, 21);
  assert.equal(contraste('#ffffff', '#ffffff'), 1);
  assert.equal(contraste('#6d28d9', '#ffffff'), contraste('#ffffff', '#6d28d9'));
});

test('paleta: texto ≥ 4,5:1 sobre blanco y sobre el fondo suave', () => {
  for (const k of ['ink', 'ink2', 'muted', 'accent', 'accentHover'] as const) {
    assert.ok(contraste(PALETA[k], PALETA.surface) >= 4.5, `${k} sobre blanco`);
    assert.ok(contraste(PALETA[k], PALETA.wash) >= 4.5, `${k} sobre wash`);
  }
  // texto blanco sobre botón primario
  assert.ok(contraste('#ffffff', PALETA.accent) >= 4.5);
  assert.ok(contraste('#ffffff', PALETA.accentHover) >= 4.5);
});

test('paleta: componentes y marcas ≥ 3:1 (WCAG 1.4.11)', () => {
  assert.ok(contraste(PALETA.borderField, PALETA.surface) >= 3, 'borde de campos');
  for (const s of SERIES) assert.ok(contraste(s.color, PALETA.surface) >= 3, `serie ${s.color}`);
  assert.ok(contraste(PALETA.bar, PALETA.surface) >= 3);
  assert.ok(contraste(PALETA.line, PALETA.surface) >= 3);
  // el gris viejo (#cdc7e3) NO sirve para bordes de campos
  assert.ok(contraste(PALETA.axis, PALETA.surface) < 3);
});

test('formatoMontoCorto', () => {
  assert.equal(formatoMontoCorto(1_200_000), '1,2 M');
  assert.equal(formatoMontoCorto(35_000), '35 k');
  assert.equal(formatoMontoCorto(1_500), '1,5 k');
  assert.equal(formatoMontoCorto(820), '820');
  assert.equal(formatoMontoCorto(0), '0');
  assert.equal(formatoMontoCorto(-2_000_000), '-2 M');
  assert.equal(formatoMontoCorto(NaN), '—');
});

test('indiceMaximo ignora nulos', () => {
  assert.equal(indiceMaximo([1, null, 5, 3]), 2);
  assert.equal(indiceMaximo([]), -1);
  assert.equal(indiceMaximo([null, undefined]), -1);
});

test('variacion no compara contra cero ni faltantes', () => {
  assert.equal(variacion(110, 100), 0.1);
  assert.equal(variacion(5, 0), null);
  assert.equal(variacion(null, 3), null);
});
