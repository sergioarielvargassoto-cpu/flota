'use client';
import type { KmHistory, RepairHistory, MaintenanceHistory } from '@/lib/types';

const SRC: Record<string, { label: string; color: string }> = {
  manual: { label: '✍ Cargado a mano', color: '#ef6c00' },
  gps: { label: '📡 Calculado con GPS', color: '#1565c0' },
  combustible: { label: '⛽ Odómetro de estación', color: '#2e7d32' },
  registro: { label: '🧾 Km de un registro', color: '#6a1b9a' },
};
/** changed_by se guarda como "origen:usuario"; los registros viejos (solo email) se muestran como manuales. */
function parseSource(by0: string) {
  const by = by0.replace(/\s*\[lectura:\d{4}-\d{2}-\d{2}\]/, '');
  const i = by.indexOf(':');
  const k = i > 0 ? by.slice(0, i) : '';
  return SRC[k] ? { ...SRC[k], who: by.slice(i + 1) } : { ...SRC.manual, who: by };
}
const readingTag = (by: string) => by.match(/\[lectura:(\d{4})-(\d{2})-(\d{2})\]/)?.slice(1).reverse().join('/') ?? null;

export function KmTimeline({ history }: { history: KmHistory[] }) {
  if (!history.length) return null;
  const sorted = [...history].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
  return (
    <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#e3f2fd', borderRadius: '8px' }}>
      <h4 style={{ margin: '0 0 12px 0' }}>📊 Historial de Kilometraje (Auditoría)</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
        {sorted.map((entry, i) => {
          const date = new Date(entry.recorded_at);
          const dateStr = date.toLocaleDateString('es-AR');
          const timeStr = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
          const change =
            entry.km_previous !== null
              ? `${entry.km_previous.toLocaleString()} → ${entry.km.toLocaleString()}`
              : `${entry.km.toLocaleString()} (inicial)`;
          const deltaNr = entry.km_previous !== null ? entry.km - entry.km_previous : 0;
          const delta = deltaNr !== 0 ? deltaNr.toLocaleString() : 'N/A';
          return (
            <div
              key={entry.id}
              style={{ padding: '10px', backgroundColor: '#fff', borderRadius: '4px', border: '1px solid #90caf9' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#0d47a1', fontWeight: 'bold' }}>
                  {dateStr} {timeStr}
                </span>
                {(() => {
                  const src = parseSource(entry.changed_by);
                  return (
                    <span style={{ fontSize: '12px' }}>
                      <b style={{ color: src.color }}>{src.label}</b> <span style={{ color: '#666' }}>· {src.who}</span>
                      {readingTag(entry.changed_by) && (
                        <b style={{ marginLeft: 6 }}>🗓 lectura del {readingTag(entry.changed_by)}</b>
                      )}
                    </span>
                  );
                })()}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold' }}>{change} km</span>
                {entry.km_previous !== null && (
                  <span style={{ color: deltaNr < 0 ? '#d32f2f' : '#388e3c', fontSize: '12px' }}>
                    ({deltaNr > 0 ? '+' : ''}
                    {delta} km)
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RepairHistoryTimeline({ history }: { history: RepairHistory[] }) {
  if (!history.length) return null;
  const sorted = [...history].sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
  return (
    <div
      style={{ marginTop: '12px', padding: '12px', backgroundColor: '#fff3e0', borderRadius: '6px', fontSize: '13px' }}
    >
      <h5 style={{ margin: '0 0 8px 0', color: '#e65100' }}>🔧 Cambios registrados</h5>
      {sorted.map((entry) => (
        <div key={entry.id} style={{ marginBottom: '6px', padding: '4px 0' }}>
          <span style={{ color: '#666' }}>{new Date(entry.changed_at).toLocaleDateString('es-AR')}:</span>
          <span>
            {' '}
            {entry.field} • {entry.old_value ? `"${entry.old_value}" → ` : ''}"<strong>{entry.new_value}</strong>"
          </span>
        </div>
      ))}
    </div>
  );
}

export function MaintenanceHistoryTimeline({ history }: { history: MaintenanceHistory[] }) {
  if (!history.length) return null;
  const sorted = [...history].sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
  return (
    <div
      style={{ marginTop: '12px', padding: '12px', backgroundColor: '#f3e5f5', borderRadius: '6px', fontSize: '13px' }}
    >
      <h5 style={{ margin: '0 0 8px 0', color: '#6a1b9a' }}>⚙️ Cambios registrados</h5>
      {sorted.map((entry) => (
        <div key={entry.id} style={{ marginBottom: '6px', padding: '4px 0' }}>
          <span style={{ color: '#666' }}>{new Date(entry.changed_at).toLocaleDateString('es-AR')}:</span>
          <span>
            {' '}
            {entry.field} • {entry.old_value ? `"${entry.old_value}" → ` : ''}"<strong>{entry.new_value}</strong>"
          </span>
        </div>
      ))}
    </div>
  );
}
