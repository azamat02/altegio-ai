import { Column, Entity, PrimaryColumn } from 'typeorm';

export type ReportDeliveryStatus = 'pending' | 'sent' | 'failed';

@Entity('report_deliveries')
export class ReportDeliveryEntity {
  @PrimaryColumn('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @PrimaryColumn('date')
  date!: string;

  @Column({ type: 'text', name: 'message_kind' })
  messageKind!: 'yesterday' | 'today';

  @Column('bigint', { name: 'message_id', nullable: true })
  messageId!: number | null;

  @Column('timestamptz', { name: 'sent_at', nullable: true })
  sentAt!: Date | null;

  @Column('text')
  status!: ReportDeliveryStatus;

  @Column('text', { nullable: true })
  error!: string | null;
}
