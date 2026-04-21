import { AltegioServiceCategoryDto } from '../../altegio/dto/service-category.dto';

export interface ServiceCategoryRow {
  tenantId: string;
  altegioCategoryId: number;
  title: string;
}

export function parseServiceCategories(tenantId: string, dtos: AltegioServiceCategoryDto[]): ServiceCategoryRow[] {
  return dtos.map(d => ({ tenantId, altegioCategoryId: d.id, title: d.title }));
}
