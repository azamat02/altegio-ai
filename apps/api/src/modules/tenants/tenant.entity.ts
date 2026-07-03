import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('tenants')
export class TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', name: 'salon_name' })
  salonName!: string;

  @Column({ type: 'bigint', name: 'location_id' })
  locationId!: number;

  @Column({ type: 'bigint', name: 'chain_id', nullable: true })
  chainId!: number | null;

  @Column({ type: 'bytea', name: 'altegio_token_encrypted' })
  altegioTokenEncrypted!: Buffer;

  @Column({ type: 'text' })
  timezone!: string;

  @Column({ type: 'bigint', name: 'telegram_chat_id', nullable: true })
  telegramChatId!: number | null;

  @Column({ type: 'boolean', name: 'report_enabled', default: false })
  reportEnabled!: boolean;

  @Column({ type: 'time', name: 'report_time', default: '09:00' })
  reportTime!: string;

  @Column({ type: 'int', name: 'working_hours_per_day', default: 10 })
  workingHoursPerDay!: number;

  @Column({ type: 'bigint', name: 'monthly_goal', nullable: true })
  monthlyGoal!: number | null;

  @Column({ type: 'int', name: 'target_utilization_pct', default: 80 })
  targetUtilizationPct!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
