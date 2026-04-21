import type { InlineKeyboardButton } from 'telegraf/typings/core/types/typegram';

export interface TenantOption {
  tenantId: string;
  label: string;
}

export function buildTenantPickerKeyboard(options: TenantOption[], actionPrefix: string): InlineKeyboardButton[][] {
  return options.map((o) => [
    { text: o.label, callback_data: `${actionPrefix}:${o.tenantId}` } as InlineKeyboardButton,
  ]);
}
