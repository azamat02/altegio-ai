import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('altegio_raw_services')
@Index(['tenantId', 'altegioServiceId'], { unique: true })
export class AltegioRawServiceEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @Column('bigint', { name: 'altegio_service_id' })
  altegioServiceId!: number;

  @Column('jsonb')
  payload!: unknown;

  @CreateDateColumn({ name: 'fetched_at' })
  fetchedAt!: Date;
}
