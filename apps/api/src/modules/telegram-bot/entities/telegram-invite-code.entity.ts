import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('telegram_invite_codes')
@Index(['tenantId', 'expiresAt'])
export class TelegramInviteCodeEntity {
  @PrimaryColumn({ type: 'varchar', length: 6 })
  code!: string;

  @Column('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @Column('bigint', { name: 'created_by_chat_id' })
  createdByChatId!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'expires_at' })
  expiresAt!: Date;

  @Column('bigint', { name: 'used_by_chat_id', nullable: true })
  usedByChatId!: number | null;

  @Column('timestamptz', { name: 'used_at', nullable: true })
  usedAt!: Date | null;
}
