import { sb } from './supabase';
import type { Vehicle, KmHistory } from './types';

/**
 * Auditoría de km: verifica que no haya inconsistencias entre:
 * - vehicles.km (actual)
 * - km_history (cambios manuales)
 * - km_reports (datos importados de Gestya)
 */
export async function auditKmConsistency() {
  const { data: vehicles } = await sb().from('vehicles').select('*');
  const { data: kmHistory } = await sb().from('km_history').select('*');
  const { data: kmReports } = await sb().from('km_reports').select('*');

  if (!vehicles || !kmHistory || !kmReports) throw new Error('Error fetching data');

  const issues: {
    type: string;
    severity: 'info' | 'warning' | 'critical';
    message: string;
    vehicleId: string;
    data?: Record<string, unknown>;
  }[] = [];

  // Por cada vehículo, verificar consistency
  for (const v of vehicles as Vehicle[]) {
    const history = (kmHistory as KmHistory[])
      .filter((h) => h.vehicle_id === v.id)
      .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
    const reports = (kmReports as any[])
      .filter((r) => r.vehicle_id === v.id)
      .sort((a, b) => b.year - a.year || b.month - a.month);

    // Check 1: km actual debería coincidir con el último km_history
    if (history.length > 0) {
      const lastHistory = history[0];
      if (v.km !== lastHistory.km) {
        issues.push({
          type: 'km_mismatch',
          severity: 'warning',
          message: `vehicles.km (${v.km}) ≠ último km_history (${lastHistory.km})`,
          vehicleId: v.id,
          data: { current: v.km, lastHistory: lastHistory.km, timestamp: lastHistory.recorded_at },
        });
      }
    }

    // Check 2: El km_previous en km_history debería corresponder al km anterior
    for (let i = 0; i < history.length - 1; i++) {
      const curr = history[i];
      const prev = history[i + 1];
      if (curr.km_previous !== prev.km) {
        issues.push({
          type: 'history_chain_broken',
          severity: 'critical',
          message: `Cadena de historial rota: km_previous (${curr.km_previous}) ≠ km anterior (${prev.km})`,
          vehicleId: v.id,
          data: { current: curr.km, kmPrevious: curr.km_previous, expectedPrevious: prev.km },
        });
      }
    }

    // Check 3: Últimos km_reports vs km_history
    if (reports.length > 0 && history.length > 0) {
      const lastReport = reports[0];
      const historyAfterLastReport = history.filter((h) => {
        const hDate = new Date(h.recorded_at);
        return hDate > new Date(`${lastReport.year}-${String(lastReport.month).padStart(2, '0')}-01`);
      });

      if (historyAfterLastReport.length > 0) {
        const lastHistoryAfterReport = historyAfterLastReport[0];
        if (v.km !== lastHistoryAfterReport.km) {
          issues.push({
            type: 'manual_vs_import',
            severity: 'info',
            message: `Cambios manuales después de última importación: ${lastHistoryAfterReport.km} (${new Date(lastHistoryAfterReport.recorded_at).toLocaleDateString('es-AR')})`,
            vehicleId: v.id,
            data: {
              manualKm: lastHistoryAfterReport.km,
              importKm: lastReport.km_total,
              importDate: `${lastReport.year}-${lastReport.month}`,
            },
          });
        }
      }
    }
  }

  return {
    timestamp: new Date().toISOString(),
    totalVehicles: vehicles.length,
    totalIssues: issues.length,
    issues,
    summary: {
      critical: issues.filter((i) => i.severity === 'critical').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      info: issues.filter((i) => i.severity === 'info').length,
    },
  };
}
