import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('staff_daily')
export class StaffDailyEntity {
  @PrimaryColumn('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @PrimaryColumn('bigint', { name: 'altegio_staff_id' })
  altegioStaffId!: number;

  @PrimaryColumn('date')
  date!: string;

  @Column('numeric', { precision: 14, scale: 2, default: 0 })
  revenue!: string;

  @Column('int', { default: 0 })
  visits!: number;

  @Column('int', { default: 0 })
  cancelled!: number;

  @Column('numeric', { name: 'avg_check', precision: 12, scale: 2, default: 0 })
  avgCheck!: string;

  @Column('timestamptz', { name: 'computed_at' })
  computedAt!: Date;
}
