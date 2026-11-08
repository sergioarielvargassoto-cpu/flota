/**
 * Funciones puras para gráficos y paleta. Sin dependencias (se testean con `node --test`).
 * Los colores deben coincidir con los tokens `--an-*` de globals.css (los gráficos SVG de Recharts
 * necesitan los valores literales).
 */

export const PALETA = {
  surface: '#ffffff',
  ink: '#0b0b0b',
  ink2: '#3f3f4a',
  muted: '#5f5f6b',
  grid: '#ece9f6',
  axis: '#cdc7e3',
  border: '#e6e1f5',
  borderField: '#8d86a8',
  wash: '#f6f3ff',
  accent: '#6d28d9',
  accentHover: '#5b21b6',
  bar: '#9975fa',
  barStrong: '#5722ad',
  line: '#3a1576',
  s1: '#9975fa',
  s2: '#5722ad',
  s3: '#0b0b0b',
} as const;

/** Hasta 4 series: tonos del mismo violeta + negro; se distinguen además por trazo. */
export const SERIES = [
  { color: PALETA.s1, dash: undefined, nombreTrazo: 'continuo' },
  { color: PALETA.s2, dash: '7 5', nombreTrazo: 'rayado' },
  { color: PALETA.s3, dash: '0.1 5', nombreTrazo: 'punteado' },
  { color: PALETA.accent, dash: '2 3', nombreTrazo: 'guiones cortos' },
] as const;

/** Luminancia relativa WCAG 2.x de un color #rrggbb. */
export function luminancia(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Relación de contraste WCAG 2.x (1 a 21). */
export function contraste(a: string, b: string): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** "1,2 M", "35 k", "820" — para ejes. Usa coma decimal (es-AR). */
export function formatoMontoCorto(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const sg = v < 0 ? '-' : '';
  const fmt = (x: number) => {
    const r = Math.round(x * 10) / 10;
    return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ',');
  };
  if (abs >= 1e6) return sg + fmt(abs / 1e6) + ' M';
  if (abs >= 1e3) return sg + fmt(abs / 1e3) + ' k';
  return sg + fmt(abs);
}

/** Índice del máximo (para etiquetar el dato más alto y titular el hallazgo). -1 si no hay datos. */
export function indiceMaximo(valores: (number | null | undefined)[]): number {
  let idx = -1;
  let max = -Infinity;
  valores.forEach((v, i) => {
    if (v !== null && v !== undefined && Number.isFinite(v) && v > max) {
      max = v;
      idx = i;
    }
  });
  return idx;
}

/** Variación porcentual entre dos valores; null si no es comparable (base 0 o faltante). */
export function variacion(actual: number | null | undefined, previo: number | null | undefined): number | null {
  if (actual === null || actual === undefined || previo === null || previo === undefined) return null;
  if (!Number.isFinite(actual) || !Number.isFinite(previo) || previo === 0) return null;
  return (actual - previo) / Math.abs(previo);
}
