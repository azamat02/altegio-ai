import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('daily_metrics')
export class DailyMetricsEntity {
  @PrimaryColumn('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @PrimaryColumn('date')
  date!: string;

  @Column('numeric', { name: 'revenue_total', precision: 14, scale: 2, default: 0 })
  revenueTotal!: string;

  @Column('int', { name: 'visits_completed', default: 0 })
  visitsCompleted!: number;

  @Column('int', { name: 'visits_cancelled', default: 0 })
  visitsCancelled!: number;

  @Column('numeric', { name: 'avg_check', precision: 12, scale: 2, default: 0 })
  avgCheck!: string;

  @Column('numeric', { name: 'occupancy_pct', precision: 5, scale: 2, default: 0 })
  occupancyPct!: string;

  @Column('timestamptz', { name: 'computed_at' })
  computedAt!: Date;
}
