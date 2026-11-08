import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatoPatente, ordenarNuevaPrimero } from '../src/lib/patentes.ts';

const v = (plate: string, year: number | null = null) => ({ plate, year });
const orden = (xs: { plate: string; year: number | null }[]) => ordenarNuevaPrimero(xs).map((x) => x.plate);

test('detecta formatos (con espacios, guiones y minúsculas)', () => {
  assert.equal(formatoPatente('AG 281 ZJ'), 'mercosur');
  assert.equal(formatoPatente('ag-281-zj'), 'mercosur');
  assert.equal(formatoPatente('OQK804'), 'abc123');
  assert.equal(formatoPatente('B1234567'), 'antigua');
  assert.equal(formatoPatente('S/D'), 'desconocido');
});

test('Mercosur va antes que ABC123, que va antes que las antiguas', () => {
  assert.deepEqual(orden([v('B1234567'), v('OQK804'), v('AA100AA'), v('XYZ')]), ['AA100AA', 'OQK804', 'B1234567', 'XYZ']);
});

test('Mercosur: primero el par inicial, después el número, después el par final', () => {
  assert.deepEqual(orden([v('AG000AA'), v('AH001AA'), v('AG650AA'), v('AF999ZZ'), v('AG650AB')]), [
    'AH001AA',
    'AG650AB',
    'AG650AA',
    'AG000AA',
    'AF999ZZ',
  ]);
});

test('ABC123: letras y luego número', () => {
  assert.deepEqual(orden([v('OQK804'), v('OUG184'), v('AAA001'), v('OUG100')]), ['OUG184', 'OUG100', 'OQK804', 'AAA001']);
});

test('desconocidas: por año, la más reciente primero', () => {
  assert.deepEqual(orden([v('ACOPLADO 1', 2010), v('ACOPLADO 2', 2020), v('SIN', null)]), ['ACOPLADO 2', 'ACOPLADO 1', 'SIN']);
});

test('no muta la lista original', () => {
  const xs = [v('OQK804'), v('AA100AA')];
  ordenarNuevaPrimero(xs);
  assert.equal(xs[0].plate, 'OQK804');
});
