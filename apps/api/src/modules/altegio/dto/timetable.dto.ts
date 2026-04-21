export interface AltegioStaffScheduleDto {
  staff_id: number;
  date: string;            // YYYY-MM-DD
  slots: Array<{ from: string; to: string }>; // HH:mm
}
