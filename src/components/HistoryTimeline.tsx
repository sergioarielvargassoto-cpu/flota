'use client';
import type { KmHistory, RepairHistory, MaintenanceHistory } from '@/lib/types';

export function KmTimeline({ history }: { history: KmHistory[] }) {
  if (!history.length) return null;
  const sorted = [...history].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
  return (
    <div style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
      <h4 style={{ margin: '0 0 12px 0' }}>📊 Evolución de Kilometraje</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '14px' }}>
        {sorted.map((entry, i) => (
          <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: i < sorted.length - 1 ? '1px solid #ddd' : 'none' }}>
            <span>{new Date(entry.recorded_at).toLocaleDateString('es-AR')}</span>
            <span style={{ fontWeight: 'bold' }}>{entry.km.toLocaleString()} km</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RepairHistoryTimeline({ history }: { history: RepairHistory[] }) {
  if (!history.length) return null;
  const sorted = [...history].sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
  return (
    <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#fff3e0', borderRadius: '6px', fontSize: '13px' }}>
      <h5 style={{ margin: '0 0 8px 0', color: '#e65100' }}>🔧 Cambios registrados</h5>
      {sorted.map((entry) => (
        <div key={entry.id} style={{ marginBottom: '6px', padding: '4px 0' }}>
          <span style={{ color: '#666' }}>{new Date(entry.changed_at).toLocaleDateString('es-AR')}:</span>
          <span> {entry.field} • {entry.old_value ? `"${entry.old_value}" → ` : ''}"<strong>{entry.new_value}</strong>"</span>
        </div>
      ))}
    </div>
  );
}

export function MaintenanceHistoryTimeline({ history }: { history: MaintenanceHistory[] }) {
  if (!history.length) return null;
  const sorted = [...history].sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());
  return (
    <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#f3e5f5', borderRadius: '6px', fontSize: '13px' }}>
      <h5 style={{ margin: '0 0 8px 0', color: '#6a1b9a' }}>⚙️ Cambios registrados</h5>
      {sorted.map((entry) => (
        <div key={entry.id} style={{ marginBottom: '6px', padding: '4px 0' }}>
          <span style={{ color: '#666' }}>{new Date(entry.changed_at).toLocaleDateString('es-AR')}:</span>
          <span> {entry.field} • {entry.old_value ? `"${entry.old_value}" → ` : ''}"<strong>{entry.new_value}</strong>"</span>
        </div>
      ))}
    </div>
  );
}
