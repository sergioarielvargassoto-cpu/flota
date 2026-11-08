'use client';
/**
 * Piezas compartidas para gráficos (Recharts) con el diseño "Análisis".
 * - TarjetaGrafico: título-hallazgo + subtítulo, botón "Ver tabla" / "Ver gráfico", leyenda arriba, nota al pie.
 *   La tabla sólo se monta al abrirla.
 * - Leyenda: claves de trazo o cuadrado del mismo color que la marca (nunca texto coloreado).
 * - TooltipAn: contenido de tooltip para <Tooltip content={...}>.
 * - EJE / GRILLA / CURSOR: props comunes para ejes y cuadrícula.
 */
import { useId, useState, type ReactNode } from 'react';
import { PALETA, SERIES } from '@/lib/graficos';

export { PALETA, SERIES };

/** Props para <XAxis>/<YAxis>: texto gris 11 px, sin línea de ticks. */
export const EJE = {
  tick: { fill: PALETA.muted, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: PALETA.axis },
} as const;
/** Props para <CartesianGrid>. */
export const GRILLA = { stroke: PALETA.grid, vertical: false } as const;
/** Cursor del tooltip en barras (fondo suave) y en líneas (mira vertical). */
export const CURSOR_BARRA = { fill: PALETA.wash } as const;
export const CURSOR_LINEA = { stroke: PALETA.axis, strokeWidth: 1 } as const;

export type ClaveLeyenda = {
  label: string;
  color: string;
  /** 'linea' dibuja un trazo (con su dasharray); 'caja' un cuadrado; 'hueco' un círculo sin relleno. */
  forma?: 'linea' | 'caja' | 'hueco';
  dash?: string;
};

function Muestra({ color, forma = 'caja', dash }: Omit<ClaveLeyenda, 'label'>) {
  if (forma === 'linea')
    return (
      <svg width="22" height="10" aria-hidden="true" focusable="false">
        <line x1="1" y1="5" x2="21" y2="5" stroke={color} strokeWidth="2.5" strokeDasharray={dash} strokeLinecap="round" />
      </svg>
    );
  if (forma === 'hueco')
    return (
      <svg width="12" height="12" aria-hidden="true" focusable="false">
        <circle cx="6" cy="6" r="4.5" fill="#fff" stroke={color} strokeWidth="2" />
      </svg>
    );
  return (
    <svg width="12" height="12" aria-hidden="true" focusable="false">
      <rect x="0.5" y="0.5" width="11" height="11" rx="3" fill={color} />
    </svg>
  );
}

export function Leyenda({ items }: { items: ClaveLeyenda[] }) {
  if (!items.length) return null;
  return (
    <ul className="an-legend">
      {items.map((it) => (
        <li key={it.label}>
          <Muestra color={it.color} forma={it.forma} dash={it.dash} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

type FilaTooltip = { name?: string | number; value?: unknown; color?: string; stroke?: string; fill?: string; dataKey?: unknown };

/**
 * Contenido de tooltip. Uso: <Tooltip content={<TooltipAn formato={(v) => money(v)} />} />
 * `titulo` permite formatear la etiqueta del eje X.
 */
export function TooltipAn({
  active,
  payload,
  label,
  formato,
  titulo,
}: {
  active?: boolean;
  payload?: readonly FilaTooltip[];
  label?: string | number;
  formato?: (v: number, nombre: string) => string;
  titulo?: (label: string | number | undefined) => ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="an-tooltip">
      <div className="t">{titulo ? titulo(label) : label}</div>
      {payload.map((p, i) => {
        const v = Number(p.value);
        const nombre = String(p.name ?? p.dataKey ?? '');
        return (
          <div className="row" key={i}>
            <svg width="14" height="8" aria-hidden="true" focusable="false">
              <line x1="1" y1="4" x2="13" y2="4" stroke={p.stroke || p.color || p.fill || PALETA.bar} strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span>{nombre}</span>
            <b>{Number.isFinite(v) ? (formato ? formato(v, nombre) : v.toLocaleString('es-AR')) : '—'}</b>
          </div>
        );
      })}
    </div>
  );
}

export function TarjetaGrafico({
  titulo,
  subtitulo,
  leyenda,
  nota,
  tabla,
  children,
  nivel = 3,
  className,
}: {
  /** Debe decir el hallazgo ("El viernes es el día de mayor ingreso"), no el nombre del gráfico. */
  titulo: ReactNode;
  subtitulo?: ReactNode;
  leyenda?: ClaveLeyenda[];
  nota?: ReactNode;
  /** Tabla equivalente; se monta sólo al pulsar "Ver tabla". */
  tabla?: () => ReactNode;
  children: ReactNode;
  nivel?: 2 | 3;
  className?: string;
}) {
  const id = useId();
  const [verTabla, setVerTabla] = useState(false);
  const H = nivel === 2 ? 'h2' : 'h3';
  return (
    <section className={'card an-chart-card ' + (className ?? '')} aria-labelledby={id + 't'}>
      <div className="an-chart-head">
        <div>
          <H id={id + 't'}>{titulo}</H>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        {tabla && (
          <button
            type="button"
            className="an-btn an-btn-ghost no-print"
            aria-pressed={verTabla}
            aria-controls={id + 'c'}
            onClick={() => setVerTabla((x) => !x)}
          >
            {verTabla ? 'Ver gráfico' : 'Ver tabla'}
          </button>
        )}
      </div>
      <div id={id + 'c'}>
        {verTabla && tabla ? (
          <div className="an-table-wrap">{tabla()}</div>
        ) : (
          <>
            {leyenda && <Leyenda items={leyenda} />}
            <div className="an-chart">{children}</div>
          </>
        )}
      </div>
      {nota && <p className="an-chart-note">{nota}</p>}
    </section>
  );
}

/** Estado vacío para un gráfico: explica qué falta y qué hacer, con el alto final para no mover el diseño. */
export function GraficoVacio({ alto = 260, children }: { alto?: number; children: ReactNode }) {
  return (
    <div className="empty" style={{ minHeight: alto, display: 'grid', placeItems: 'center' }}>
      <div>{children}</div>
    </div>
  );
}
