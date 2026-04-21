import resourcesSample from '../../../../test/fixtures/altegio/resources-sample.json';
import { parseResources } from './resources.parser';
import { AltegioResourceDto } from '../../altegio/dto/resource.dto';

describe('parseResources', () => {
  it('maps each resource to a row with tenantId + altegioId + title', () => {
    const rows = parseResources('tenant-a', resourcesSample as AltegioResourceDto[]);
    expect(rows).toHaveLength(resourcesSample.length);
    expect(rows[0]).toEqual({
      tenantId: 'tenant-a',
      altegioId: resourcesSample[0].id,
      title: resourcesSample[0].title,
    });
  });
});
