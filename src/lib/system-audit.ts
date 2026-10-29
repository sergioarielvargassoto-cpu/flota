import { sb } from './supabase';

/**
 * AUDITORÍA COMPLETA DEL SISTEMA FLOTA
 * Verifica integridad de datos, flujo de información y posibles conflictos
 */

export async function systemAudit() {
  const issues: {
    table: string;
    type: string;
    severity: 'critical' | 'warning' | 'info';
    message: string;
    count: number;
    details?: any;
  }[] = [];

  try {
    // ========== 1. INTEGRIDAD REFERENCIAL ==========
    console.log('Analizando integridad referencial...');

    // Reparaciones huérfanas (sin vehículo)
    const { data: orphanedRepairs } = await sb()
      .from('repairs')
      .select('id, vehicle_id')
      .is('vehicle_id', null);
    if (orphanedRepairs?.length) {
      issues.push({
        table: 'repairs',
        type: 'orphaned_records',
        severity: 'critical',
        message: 'Reparaciones sin vehículo asignado',
        count: orphanedRepairs.length,
        details: orphanedRepairs,
      });
    }

    // Mantenimientos huérfanos
    const { data: orphanedMaint } = await sb()
      .from('maintenance')
      .select('id, vehicle_id')
      .is('vehicle_id', null);
    if (orphanedMaint?.length) {
      issues.push({
        table: 'maintenance',
        type: 'orphaned_records',
        severity: 'critical',
        message: 'Mantenimientos sin vehículo asignado',
        count: orphanedMaint.length,
        details: orphanedMaint,
      });
    }

    // ========== 2. DUPLICADOS ==========
    console.log('Buscando duplicados...');

    // Vehículos con patente duplicada
    const { data: vehicles } = await sb()
      .from('vehicles')
      .select('id, plate');

    if (vehicles) {
      const plateCount = new Map<string, number>();
      vehicles.forEach((v: any) => {
        plateCount.set(v.plate, (plateCount.get(v.plate) || 0) + 1);
      });
      const duplicatePlates = Array.from(plateCount.entries())
        .filter(([_, count]) => count > 1)
        .map(([plate, count]) => ({ plate, count }));

      if (duplicatePlates.length) {
        issues.push({
          table: 'vehicles',
          type: 'duplicate_key',
          severity: 'critical',
          message: 'Patentes duplicadas en la BD',
          count: duplicatePlates.length,
          details: duplicatePlates,
        });
      }
    }

    // Corridas duplicadas (mismo vehículo, mismo día)
    const { data: trips } = await sb()
      .from('trips')
      .select('vehicle_id, date');

    if (trips) {
      const tripKey = new Map<string, number>();
      trips.forEach((t: any) => {
        const key = `${t.vehicle_id}-${t.date}`;
        tripKey.set(key, (tripKey.get(key) || 0) + 1);
      });
      const duplicateTrips = Array.from(tripKey.entries())
        .filter(([_, count]) => count > 1)
        .map(([key, count]) => ({ key, count }));

      if (duplicateTrips.length) {
        issues.push({
          table: 'trips',
          type: 'duplicate_key',
          severity: 'warning',
          message: 'Corridas duplicadas para el mismo vehículo/día (debería haber constraint UNIQUE)',
          count: duplicateTrips.length,
          details: duplicateTrips,
        });
      }
    }

    // ========== 3. FLUJO DE DATOS: KM ==========
    console.log('Analizando flujo de km...');

    const { data: allVehicles } = await sb()
      .from('vehicles')
      .select('id, km, km_date');

    const { data: kmHistory } = await sb()
      .from('km_history')
      .select('vehicle_id, km, recorded_at');

    const { data: kmReports } = await sb()
      .from('km_reports')
      .select('vehicle_id, km_total, month, year');

    if (allVehicles && kmHistory && kmReports) {
      for (const v of allVehicles as any[]) {
        const vHistory = (kmHistory as any[])
          .filter((h) => h.vehicle_id === v.id)
          .sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());

        const vReports = (kmReports as any[])
          .filter((r) => r.vehicle_id === v.id)
          .sort((a, b) => b.year - a.year || b.month - a.month);

        // Check: current km vs last history
        if (vHistory.length > 0 && v.km !== vHistory[0].km) {
          issues.push({
            table: 'km_flow',
            type: 'km_mismatch',
            severity: 'warning',
            message: `${v.id.slice(0, 8)}: vehicles.km (${v.km}) ≠ último km_history (${vHistory[0].km})`,
            count: 1,
            details: { vehicle_id: v.id, current: v.km, lastHistory: vHistory[0].km },
          });
        }

        // Check: history chain integrity
        for (let i = 0; i < vHistory.length - 1; i++) {
          const curr = vHistory[i];
          const prev = vHistory[i + 1];
          if (curr.km_previous !== prev.km) {
            issues.push({
              table: 'km_history',
              type: 'chain_broken',
              severity: 'critical',
              message: `${v.id.slice(0, 8)}: Cadena de historial rota en registros ${i} y ${i + 1}`,
              count: 1,
              details: { vehicle_id: v.id, index: i },
            });
          }
        }

        // Check: manual vs imported km
        if (vHistory.length > 0 && vReports.length > 0) {
          const lastHistory = vHistory[0];
          const lastReport = vReports[0];
          const reportDate = new Date(`${lastReport.year}-${String(lastReport.month).padStart(2, '0')}-01`);
          const historyDate = new Date(lastHistory.recorded_at);

          if (historyDate > reportDate && lastHistory.km !== lastReport.km_total) {
            issues.push({
              table: 'km_flow',
              type: 'manual_after_import',
              severity: 'info',
              message: `${v.id.slice(0, 8)}: Cambios manuales posteriores a última importación`,
              count: 1,
              details: {
                vehicle_id: v.id,
                manualKm: lastHistory.km,
                importKm: lastReport.km_total,
                importDate: `${lastReport.year}-${lastReport.month}`,
              },
            });
          }
        }
      }
    }

    // ========== 4. ADJUNTOS HUÉRFANOS ==========
    console.log('Analizando adjuntos...');

    const { data: attachments } = await sb()
      .from('attachments')
      .select('id, document_id, repair_id, maintenance_id, infraction_id');

    if (attachments) {
      const orphanedAttachments = (attachments as any[]).filter(
        (a) => !a.document_id && !a.repair_id && !a.maintenance_id && !a.infraction_id
      );

      if (orphanedAttachments.length) {
        issues.push({
          table: 'attachments',
          type: 'orphaned_records',
          severity: 'warning',
          message: 'Adjuntos sin propietario (no asociados a documento/reparación/etc)',
          count: orphanedAttachments.length,
          details: orphanedAttachments.map((a) => ({ id: a.id })),
        });
      }
    }

    // ========== 5. DATOS INCONSISTENTES ==========
    console.log('Buscando inconsistencias...');

    // Multas sin infracción
    const { data: fines } = await sb()
      .from('fines')
      .select('id, infraction_id');

    const { data: infractions } = await sb()
      .from('infractions')
      .select('id');

    if (fines && infractions) {
      const infractionIds = new Set((infractions as any[]).map((i) => i.id));
      const orphanedFines = (fines as any[]).filter((f) => !infractionIds.has(f.infraction_id));

      if (orphanedFines.length) {
        issues.push({
          table: 'fines',
          type: 'broken_foreign_key',
          severity: 'critical',
          message: 'Multas referenciando infracciones inexistentes',
          count: orphanedFines.length,
          details: orphanedFines.map((f) => ({ id: f.id, infraction_id: f.infraction_id })),
        });
      }
    }

    // ========== 6. DATOS VACÍOS PROBLEMÁTICOS ==========
    console.log('Buscando campos críticos vacíos...');

    // Vehículos sin tipo
    const { data: vehiclesNoType } = await sb()
      .from('vehicles')
      .select('id, plate')
      .is('type', null);

    if (vehiclesNoType?.length) {
      issues.push({
        table: 'vehicles',
        type: 'missing_critical_field',
        severity: 'info',
        message: 'Vehículos sin tipo especificado',
        count: vehiclesNoType.length,
      });
    }

    // Reparaciones sin descripción
    const { data: repairsNoDesc } = await sb()
      .from('repairs')
      .select('id')
      .is('description', null);

    if (repairsNoDesc?.length) {
      issues.push({
        table: 'repairs',
        type: 'missing_critical_field',
        severity: 'warning',
        message: 'Reparaciones sin descripción',
        count: repairsNoDesc.length,
      });
    }

  } catch (error) {
    issues.push({
      table: 'system',
      type: 'audit_error',
      severity: 'critical',
      message: `Error durante auditoría: ${error instanceof Error ? error.message : String(error)}`,
      count: 1,
    });
  }

  // Resumen
  const summary = {
    timestamp: new Date().toISOString(),
    totalIssues: issues.length,
    bySeverity: {
      critical: issues.filter((i) => i.severity === 'critical').length,
      warning: issues.filter((i) => i.severity === 'warning').length,
      info: issues.filter((i) => i.severity === 'info').length,
    },
    byType: {} as Record<string, number>,
  };

  issues.forEach((i) => {
    summary.byType[i.type] = (summary.byType[i.type] || 0) + 1;
  });

  return { issues, summary };
}
