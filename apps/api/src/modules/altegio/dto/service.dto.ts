export interface AltegioServiceDto {
  id: number;
  title: string;
  category_id?: number;
  price_min?: number;
  price_max?: number;
  active?: number;
  duration?: number;
}
