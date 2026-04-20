import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('staff')
export class StaffEntity {
  @PrimaryColumn('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @PrimaryColumn('bigint', { name: 'altegio_staff_id' })
  altegioStaffId!: number;

  @Column('text')
  name!: string;

  @Column('text', { nullable: true })
  specialization!: string | null;

  @Column('text', { name: 'position_title', nullable: true })
  positionTitle!: string | null;

  @Column('boolean', { default: false })
  fired!: boolean;

  @Column('boolean', { default: true })
  bookable!: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
