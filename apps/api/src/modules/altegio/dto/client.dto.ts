export interface AltegioClientDto {
  id: number;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  visits_count?: number;
  last_visit_date?: string | null;
  spent?: number;
  paid?: number;
  balance?: number;
}
