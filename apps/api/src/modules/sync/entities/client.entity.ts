import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('clients')
export class ClientEntity {
  @PrimaryColumn('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @PrimaryColumn('bigint', { name: 'altegio_client_id' })
  altegioClientId!: number;

  @Column('text', { nullable: true })
  name!: string | null;

  @Column('text', { nullable: true })
  phone!: string | null;

  @Column('int', { name: 'visits_count', nullable: true })
  visitsCount!: number | null;

  @Column('date', { name: 'last_visit_date', nullable: true })
  lastVisitDate!: string | null;

  @Column('numeric', { precision: 14, scale: 2, nullable: true })
  spent!: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
