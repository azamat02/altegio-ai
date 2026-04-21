import { AltegioResourceDto } from '../../altegio/dto/resource.dto';

export interface ResourceRow {
  tenantId: string;
  altegioId: number;
  title: string;
}

export function parseResources(tenantId: string, dtos: AltegioResourceDto[]): ResourceRow[] {
  return dtos.map(d => ({ tenantId, altegioId: d.id, title: d.title }));
}
