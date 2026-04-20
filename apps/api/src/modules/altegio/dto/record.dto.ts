export interface AltegioRecordDto {
  id: number;
  date: string;
  datetime: string;
  staff_id: number;
  client?: { id: number; name?: string; phone?: string } | null;
  services: Array<{ id: number; title: string; cost: number; discount?: number }>;
  cost: number;
  attendance: number;
  paid_full: number;
  online: boolean;
  seance_length: number;
  deleted: boolean;
  visit_id?: number;
  create_date?: string;
}
