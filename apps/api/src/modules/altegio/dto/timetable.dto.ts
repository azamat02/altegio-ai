export interface AltegioResourceTimetableDto {
  date: string;            // YYYY-MM-DD
  is_working: boolean;
  slots: Array<{ from: string; to: string }>; // HH:mm
}
