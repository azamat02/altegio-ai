import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type AiInsightStatus = 'ok' | 'timeout' | 'validation_failed' | 'api_error' | 'disabled';

@Entity('ai_insight_logs')
export class AiInsightLogEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @Column('date')
  date!: string;

  @Column('text', { name: 'prompt_hash' })
  promptHash!: string;

  @Column('text', { nullable: true })
  response!: string | null;

  @Column('int', { nullable: true })
  ms!: number | null;

  @Column('text')
  status!: AiInsightStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
