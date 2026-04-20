import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('altegio_raw_records')
@Index(['tenantId', 'altegioRecordId'], { unique: true })
export class AltegioRawRecordEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @Column('bigint', { name: 'altegio_record_id' })
  altegioRecordId!: number;

  @Column('jsonb')
  payload!: unknown;

  @CreateDateColumn({ name: 'fetched_at' })
  fetchedAt!: Date;
}
