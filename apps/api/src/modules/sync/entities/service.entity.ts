import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('services')
export class ServiceEntity {
  @PrimaryColumn('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @PrimaryColumn('bigint', { name: 'altegio_service_id' })
  altegioServiceId!: number;

  @Column('text')
  title!: string;

  @Column('bigint', { name: 'category_id', nullable: true })
  categoryId!: number | null;

  @Column('numeric', { name: 'price_min', precision: 12, scale: 2, nullable: true })
  priceMin!: string | null;

  @Column('numeric', { name: 'price_max', precision: 12, scale: 2, nullable: true })
  priceMax!: string | null;

  @Column('boolean', { default: true })
  active!: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
