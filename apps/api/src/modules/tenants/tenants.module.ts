import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantEntity } from './tenant.entity';
import { TenantsService } from './tenants.service';
import { TokenCipher } from './token-cipher.service';
import { loadConfig } from '../../config/app.config';

@Module({
  imports: [TypeOrmModule.forFeature([TenantEntity])],
  providers: [
    {
      provide: TokenCipher,
      useFactory: () => new TokenCipher(loadConfig().APP_ENCRYPTION_KEY),
    },
    TenantsService,
  ],
  exports: [TenantsService, TokenCipher],
})
export class TenantsModule {}
