'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useData } from '@/lib/data';

const TABS: [string, string][] = [
  ['/', 'Panel'],
  ['/vehiculos', 'Vehículos'],
  ['/choferes', 'Choferes'],
  ['/infracciones', 'Infracciones'],
  ['/informe', 'Informe de gestión'],
  ['/reparaciones', 'Reparaciones'],
  ['/mantenimientos', 'Mantenimientos'],
  ['/recorridos', 'Recorridos'],
  ['/auditoria-km', 'Auditoría km'],
  ['/combustible', 'Combustible'],
  ['/talleres', 'Talleres'],
  ['/ajustes', 'Ajustes'],
];

/** Títulos de pestaña para las rutas que no están en el menú. */
const EXTRA_TITLES: [string, string][] = [
  ['/reportes-km', 'Reportes de km'],
  ['/reportes-costos', 'Reportes de costos'],
  ['/reportes-conductores', 'Reportes de conductores'],
  ['/reportes-sucursales', 'Reportes por sucursal'],
];

const isActive = (href: string, path: string) => (href === '/' ? path === '/' : path.startsWith(href));

function pageTitle(path: string): string {
  const hit = [...EXTRA_TITLES, ...TABS].find(([href]) => isActive(href, path));
  const base = hit ? hit[1] : 'Control de Flota';
  const detalle = /^\/[^/]+\/[^/]+/.test(path) && !path.startsWith('/reportes') ? ' · detalle' : '';
  return `${base}${detalle} · Control de Flota`;
}

function Esqueleto() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando datos…</span>
      <div className="skel" style={{ height: 28, width: 260, marginBottom: 20 }} />
      <div className="cards">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skel" style={{ height: 92, borderRadius: 16 }} />
        ))}
      </div>
      <div className="skel" style={{ height: 320, borderRadius: 16 }} />
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { settings, loading, error } = useData();
  return (
    <>
      <title>{pageTitle(path)}</title>
      <a className="skip" href="#contenido">
        Saltar al contenido
      </a>
      <header>
        <h1>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            style={{ verticalAlign: '-4px', marginRight: 8 }}
          >
            <rect width="24" height="24" rx="6" fill="#6d28d9" />
            <path d="M5 15V9h8v6M13 11h3l3 3v1h-6" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
            <circle cx="8" cy="16.5" r="1.6" fill="#fff" />
            <circle cx="16" cy="16.5" r="1.6" fill="#fff" />
          </svg>
          Control de Flota <span className="muted">{settings.company ? '· ' + settings.company : ''}</span>
        </h1>
        <nav aria-label="Principal">
          {TABS.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={isActive(href, path) ? 'on' : ''}
              aria-current={isActive(href, path) ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/logo.png" alt="Serprove" />
      </header>
      <main id="contenido" tabIndex={-1}>
        {error ? (
          <div className="err" role="alert">
            <b>No pude cargar los datos.</b> {error}
            {'\n\n'}Revisá la conexión a internet y volvé a intentar. Si el problema sigue, verificá que se haya ejecutado
            el SQL de supabase/migrations/0001_schema.sql.
            {'\n\n'}
            <button className="b1" onClick={() => window.location.reload()}>
              Reintentar
            </button>
          </div>
        ) : loading ? (
          <Esqueleto />
        ) : (
          children
        )}
      </main>
    </>
  );
}
