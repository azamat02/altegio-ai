import { Module } from '@nestjs/common';
import { AltegioClient } from './altegio.client';
import { loadConfig } from '../../config/app.config';
import { RecordsEndpoint } from './endpoints/records';
import { ClientsEndpoint } from './endpoints/clients';
import { StaffEndpoint } from './endpoints/staff';
import { ServicesEndpoint } from './endpoints/services';

@Module({
  providers: [
    {
      provide: AltegioClient,
      useFactory: () => new AltegioClient({
        baseUrl: loadConfig().ALTEGIO_BASE_URL,
        requestsPerSecond: 3,
        retries: 3,
      }),
    },
    RecordsEndpoint,
    ClientsEndpoint,
    StaffEndpoint,
    ServicesEndpoint,
  ],
  exports: [AltegioClient, RecordsEndpoint, ClientsEndpoint, StaffEndpoint, ServicesEndpoint],
})
export class AltegioModule {}
