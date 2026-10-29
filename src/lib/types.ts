export type Vehicle = {
  id: string; plate: string; type: string | null; brand: string | null; model: string | null;
  year: number | null; km: number | null; km_date: string | null; last_service_km: number | null;
  fuel_card: string | null; driver_id: string | null; status: 'Activo' | 'En taller' | 'Baja';
  chassis: string | null; notes: string | null;
};
export type Driver = { id: string; name: string; dni: string | null; phone: string | null; notes: string | null };
export type Doc = {
  id: string; vehicle_id: string | null; driver_id: string | null; doc_type: string;
  expires_on: string | null; reference: string | null; notes: string | null;
};
export type Workshop = { id: string; name: string; phone: string | null; specialty: string | null; address: string | null; notes: string | null };
export type Repair = {
  id: string; vehicle_id: string; date: string; description: string; workshop_id: string | null;
  km: number | null; cost: number | null; invoice: string | null; status: 'Pendiente' | 'En curso' | 'Finalizada';
};
export type Maint = {
  id: string; vehicle_id: string; type: string; date: string; km: number | null; workshop_id: string | null;
  cost: number | null; next_date: string | null; next_km: number | null; notes: string | null;
};
export type Fuel = {
  id: string; vehicle_id: string; date: string; liters: number; amount: number | null; km: number | null;
  km_raw: number | null; station: string | null; product: string | null; driver_name: string | null; receipt: string | null;
};
export type Trip = {
  id: string; vehicle_id: string; date: string; km_calc: number; km_reported: number | null;
  max_speed: number | null; moving_time: string | null;
};
export type Attachment = {
  id: string; document_id: string | null; repair_id: string | null; maintenance_id: string | null; infraction_id: string | null; path: string; name: string;
};
export type Infraction = {
  id: string; driver_id: string; vehicle_id: string; date: string; type: string;
  description: string | null; location: string | null; infraction_number: string | null;
  fine_amount: number | null; status: 'Registrada' | 'Pagada' | 'Anulada'; notes: string | null;
};
export type Fine = {
  id: string; infraction_id: string; amount: number; paid_amount: number | null;
  paid_date: string | null; due_date: string | null; payment_method: string | null;
  receipt: string | null; notes: string | null;
};
export type Settings = { id: number; company: string; d1: number; d2: number; d3: number; km_alert: number; service_km: number };

export type TableName =
  | 'vehicles' | 'drivers' | 'documents' | 'workshops' | 'repairs'
  | 'maintenance' | 'fuel_loads' | 'trips' | 'attachments' | 'infractions' | 'fines';

export type Status = 'vencido' | 'critico' | 'urgente' | 'proximo' | 'ok' | 'nd';
