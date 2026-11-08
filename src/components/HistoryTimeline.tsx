'use client';
import type { KmHistory, RepairHistory, MaintenanceHistory } from '@/lib/types';

const SRC: Record<string, { label: string; icon: string }> = {
  manual: { label: 'Cargado a mano', icon: '✍' },
  gps: { label: 'Calculado con GPS', icon: '📡' },
  combustible: { label: 'Odómetro de estación', icon: '⛽' },
  registro: { label: 'Km de un registro', icon: '🧾' },
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
    <section className="card" style={{ marginTop: 20 }} aria-labelledby="km-hist-title">
      <h4 id="km-hist-title" style={{ margin: '0 0 12px 0' }}>
        Historial de kilometraje (auditoría)
      </h4>
      <ol style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, listStyle: 'none', margin: 0, padding: 0 }}>
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
            <li
              key={entry.id}
              style={{ padding: 10, borderRadius: 8, border: '1px solid var(--an-border)', background: 'var(--an-surface)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span className="an-ink-2" style={{ fontWeight: 700 }}>
                  {dateStr} {timeStr}
                </span>
                {(() => {
                  const src = parseSource(entry.changed_by);
                  return (
                    <span style={{ fontSize: 12 }}>
                      <span className="bd">
                        <span aria-hidden="true">{src.icon}</span> {src.label}
                      </span>{' '}
                      <span className="muted">· {src.who}</span>
                      {readingTag(entry.changed_by) && (
                        <b style={{ marginLeft: 6 }}>
                          <span aria-hidden="true">🗓</span> lectura del {readingTag(entry.changed_by)}
                        </b>
                      )}
                    </span>
                  );
                })()}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="num" style={{ fontWeight: 700 }}>
                  {change} km
                </span>
                {entry.km_previous !== null && (
                  <span className="num" style={{ color: deltaNr < 0 ? 'var(--r)' : '#166534', fontSize: 12, fontWeight: 600 }}>
                    ({deltaNr > 0 ? '+' : ''}
                    {delta} km)
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function RepairHistoryTimeline({ history }: { history: RepairHistory[] }) {
  if (!history.length) return null;
  const sorted = [...history].sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
  return (
    <div className="card" style={{ marginTop: 12, padding: 12, fontSize: 13 }}>
      <h5 style={{ margin: '0 0 8px 0', fontSize: 13 }}>Cambios registrados</h5>
      {sorted.map((entry) => (
        <div key={entry.id} style={{ marginBottom: '6px', padding: '4px 0' }}>
          <span className="muted">{new Date(entry.changed_at).toLocaleDateString('es-AR')}:</span>
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
    <div className="card" style={{ marginTop: 12, padding: 12, fontSize: 13 }}>
      <h5 style={{ margin: '0 0 8px 0', fontSize: 13 }}>Cambios registrados</h5>
      {sorted.map((entry) => (
        <div key={entry.id} style={{ marginBottom: '6px', padding: '4px 0' }}>
          <span className="muted">{new Date(entry.changed_at).toLocaleDateString('es-AR')}:</span>
          <span>
            {' '}
            {entry.field} • {entry.old_value ? `"${entry.old_value}" → ` : ''}"<strong>{entry.new_value}</strong>"
          </span>
        </div>
      ))}
    </div>
  );
}
