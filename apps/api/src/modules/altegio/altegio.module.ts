import { Module } from '@nestjs/common';
import { AltegioClient } from './altegio.client';
import { loadConfig } from '../../config/app.config';
import { RecordsEndpoint } from './endpoints/records';
import { ClientsEndpoint } from './endpoints/clients';
import { StaffEndpoint } from './endpoints/staff';
import { ServicesEndpoint } from './endpoints/services';
import { ResourcesEndpoint } from './endpoints/resources';
import { TimetableEndpoint } from './endpoints/timetable';

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
    ResourcesEndpoint,
    TimetableEndpoint,
  ],
  exports: [AltegioClient, RecordsEndpoint, ClientsEndpoint, StaffEndpoint, ServicesEndpoint, ResourcesEndpoint, TimetableEndpoint],
})
export class AltegioModule {}
