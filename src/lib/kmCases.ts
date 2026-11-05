/**
 * Aclaraciones del responsable sobre casos puntuales de km dudoso. Se muestran junto a la explicación automática en Auditoría km.
 * Clave: "PATENTE|AAAA-MM-DD|km" del registro. Cuando el registro se corrige, la nota deja de mostrarse sola (ya no coincide la clave).
 */
export type CaseNote = { note: string; by: string; on: string };

export const CASE_NOTES: Record<string, CaseNote> = {
  'AG281ZJ|2026-09-14|134999': {
    note:
      'Mercedes Benz: según el responsable, el service se hizo mucho después de lo debido (el service real quedó cargado el 07/10 a 145.000 km). ' +
      'Esto es consistente con que este 134.999 sea el km al que el service anterior DEBÍA hacerse (≈135.000) cargado en lugar del que marcaba el tablero el 14/09 (≈141.000). A confirmar con el comprobante de la reparación.',
    by: 'Responsable',
    on: '2026-11-04',
  },
  'OUG184|2026-09-04|309194': {
    note:
      'El responsable advierte: no darla por válida solo porque encaja con el GPS. Pudo haberse cargado con datos de OTRO vehículo (con YPF en Ruta cada tarjeta está asociada a un vehículo, así que sería poco probable; a confirmar). ' +
      'Dato del sistema: García Ramón, remito 3561-00082476, 53,08 L, 04/09; el km declarado (309.194) queda a 15 km de lo esperable por el GPS (310.265 al 31/10 menos 1.056 km), y ningún otro vehículo tiene un odómetro cercano. Sigue SIN usarse como lectura hasta confirmar con el comprobante y la tarjeta usada.',
    by: 'Responsable',
    on: '2026-11-04',
  },
  'AE615LU|2026-09-05|120000': {
    note: 'El responsable todavía no estudió qué pasó con este registro: queda pendiente de revisar con el comprobante del service.',
    by: 'Responsable',
    on: '2026-11-04',
  },
  'NWG124|2026-10-13|185000': {
    note: 'El responsable todavía no estudió qué pasó con este registro: queda pendiente de revisar con el comprobante del taller.',
    by: 'Responsable',
    on: '2026-11-04',
  },
};
export const caseNoteFor = (plate: string, date: string, km: number) => CASE_NOTES[`${plate}|${date}|${km}`] ?? null;
