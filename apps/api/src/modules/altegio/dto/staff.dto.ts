export interface AltegioStaffDto {
  id: number;
  name: string;
  specialization?: string;
  position?: { id: number; title: string } | null;
  fired: number;
  hidden?: number;
  bookable?: boolean;
  status?: number;
}
