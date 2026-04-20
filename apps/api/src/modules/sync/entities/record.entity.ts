import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('records')
@Index(['tenantId', 'altegioRecordId'], { unique: true })
@Index(['tenantId', 'datetime'])
export class RecordEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @Column('bigint', { name: 'altegio_record_id' })
  altegioRecordId!: number;

  @Column('bigint', { name: 'altegio_staff_id', nullable: true })
  altegioStaffId!: number | null;

  @Column('bigint', { name: 'altegio_client_id', nullable: true })
  altegioClientId!: number | null;

  @Column('timestamptz')
  datetime!: Date;

  @Column('int', { name: 'seance_length', nullable: true })
  seanceLength!: number | null;

  @Column('numeric', { precision: 12, scale: 2, default: 0 })
  cost!: string;

  @Column('smallint', { default: 0 })
  attendance!: number;

  @Column('smallint', { name: 'paid_full', default: 0 })
  paidFull!: number;

  @Column('boolean', { name: 'is_online', default: false })
  isOnline!: boolean;

  @Column('boolean', { default: false })
  deleted!: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
