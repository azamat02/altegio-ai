import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export type TenantChatRole = 'owner' | 'member';

@Entity('tenant_chats')
export class TenantChatEntity {
  @PrimaryColumn('uuid', { name: 'tenant_id' })
  tenantId!: string;

  @PrimaryColumn('bigint', { name: 'chat_id' })
  chatId!: number;

  @Column({ type: 'text' })
  role!: TenantChatRole;

  @Column({ type: 'boolean', default: true })
  subscribed!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
