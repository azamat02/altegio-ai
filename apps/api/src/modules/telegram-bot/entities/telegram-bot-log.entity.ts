import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('telegram_bot_logs')
@Index(['chatId', 'command', 'respondedAt'])
export class TelegramBotLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column('bigint', { name: 'chat_id' })
  chatId!: number;

  @Column('uuid', { name: 'tenant_id', nullable: true })
  tenantId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  command!: string;

  @Column({ type: 'jsonb', default: '{}' })
  args!: Record<string, unknown>;

  @CreateDateColumn({ name: 'responded_at' })
  respondedAt!: Date;
}
