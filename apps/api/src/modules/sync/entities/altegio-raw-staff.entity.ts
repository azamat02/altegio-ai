import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity('altegio_raw_staff')
@Index(['tenantId', 'altegioStaffId'], { unique: true })
export class AltegioRawStaffEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @Column('bigint', { name: 'altegio_staff_id' })
  altegioStaffId!: number;

  @Column('jsonb')
  payload!: unknown;

  @CreateDateColumn({ name: 'fetched_at' })
  fetchedAt!: Date;
}
