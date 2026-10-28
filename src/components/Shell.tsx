'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useData } from '@/lib/data';

const TABS: [string, string][] = [
  ['/', '📊 Panel'], ['/vehiculos', '🚚 Vehículos'], ['/choferes', '🪪 Choferes'], ['/reparaciones', '🔧 Reparaciones'],
  ['/mantenimientos', '🛢 Mantenimientos'], ['/recorridos', '📍 Recorridos'], ['/combustible', '⛽ Combustible'],
  ['/talleres', '🏭 Talleres'], ['/ajustes', '⚙ Ajustes'],
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { settings, loading, error } = useData();
  return (
    <>
      <header>
        <h1>🚚 Control de Flota <span className="muted">{settings.company ? '· ' + settings.company : ''}</span></h1>
        <nav>
          {TABS.map(([href, label]) => (
            <Link key={href} href={href} className={(href === '/' ? path === '/' : path.startsWith(href)) ? 'on' : ''}>{label}</Link>
          ))}
        </nav>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/logo.png" alt="Serprove" />
      </header>
      <main>
        {error ? (
          <div className="err">No pude cargar los datos: {error}{'\n\n'}¿Ejecutaste el SQL de supabase/migrations/0001_schema.sql?</div>
        ) : loading ? (
          <div className="empty">Cargando datos…</div>
        ) : (
          children
        )}
      </main>
    </>
  );
}
