import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('altegio_raw_clients')
@Index(['tenantId', 'altegioClientId'], { unique: true })
export class AltegioRawClientEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @Column('bigint', { name: 'altegio_client_id' })
  altegioClientId!: number;

  @Column('jsonb')
  payload!: unknown;

  @CreateDateColumn({ name: 'fetched_at' })
  fetchedAt!: Date;
}
