import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantEntity } from './tenant.entity';
import { TokenCipher } from './token-cipher.service';

export interface CreateTenantInput {
  salonName: string;
  locationId: number;
  chainId?: number;
  altegioToken: string;
  timezone: string;
  telegramChatId?: number;
  reportTime?: string;
  workingHoursPerDay?: number;
}

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(TenantEntity) private readonly repo: Repository<TenantEntity>,
    @Inject(TokenCipher) private readonly cipher: TokenCipher,
  ) {}

  async create(input: CreateTenantInput): Promise<TenantEntity> {
    const entity = this.repo.create({
      salonName: input.salonName,
      locationId: input.locationId,
      chainId: input.chainId ?? null,
      altegioTokenEncrypted: this.cipher.encrypt(input.altegioToken),
      timezone: input.timezone,
      telegramChatId: input.telegramChatId ?? null,
      reportEnabled: false,
      reportTime: input.reportTime ?? '09:00',
      workingHoursPerDay: input.workingHoursPerDay ?? 10,
    });
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<TenantEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByLocation(locationId: number): Promise<TenantEntity | null> {
    return this.repo.findOne({ where: { locationId } });
  }

  async findEnabled(): Promise<TenantEntity[]> {
    return this.repo.find({ where: { reportEnabled: true } });
  }

  async getAltegioToken(tenantId: string): Promise<string> {
    const t = await this.findById(tenantId);
    if (!t) throw new Error(`Tenant ${tenantId} not found`);
    return this.cipher.decrypt(t.altegioTokenEncrypted);
  }

  async setTelegramChat(tenantId: string, chatId: number): Promise<void> {
    await this.repo.update({ id: tenantId }, { telegramChatId: chatId });
  }

  async setReportEnabled(tenantId: string, enabled: boolean): Promise<void> {
    await this.repo.update({ id: tenantId }, { reportEnabled: enabled });
  }

  async setMonthlyGoal(tenantId: string, amount: number | null): Promise<void> {
    await this.repo.update({ id: tenantId }, { monthlyGoal: amount });
  }
}
