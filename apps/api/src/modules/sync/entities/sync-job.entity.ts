import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type SyncJobStatus = 'running' | 'success' | 'failed';

@Entity('sync_jobs')
export class SyncJobEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @Column('text')
  status!: SyncJobStatus;

  @CreateDateColumn({ name: 'started_at' })
  startedAt!: Date;

  @Column('timestamptz', { name: 'finished_at', nullable: true })
  finishedAt!: Date | null;

  @Column('int', { name: 'records_fetched', default: 0 })
  recordsFetched!: number;

  @Column('text', { nullable: true })
  error!: string | null;
}
