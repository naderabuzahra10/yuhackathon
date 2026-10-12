export type ItemIcon = 'coffee' | 'iced' | 'tea' | 'cookie' | 'cake' | 'bread' | 'bowl' | 'juice' | 'icecream' | 'burger' | 'meal' | 'water' | 'bar' | 'basket' | 'notebook' | 'voucher' | 'box';

export interface MenuItem {
  id: string;
  name_en: string;
  name_ar: string;
  points: number;
  icon: ItemIcon;
}

export interface Outlet {
  id: string;
  name_en: string;
  name_ar: string;
  kind_en: string;
  kind_ar: string;
  color: string;
  ink: string;
  mono: string;
  prefix: string;
  items: MenuItem[];
}

export const EARN: {
  verified: number; award: number; attended: number; booked: number; club: number; classPresent: number; classLate: number;
  task: number; feedback: number; competition: number; result: number; resource: number; quiz: number;
};

export type EarnKind = keyof typeof EARN | 'classes';

export interface Entry {
  id: string;
  kind: EarnKind | 'redeem';
  title_en: string;
  title_ar: string;
  points: number;
  at: string | null;
  link?: string;
}

export const OUTLETS: Outlet[];
export function findMenuItem(itemId: string): { outlet: Outlet; item: MenuItem } | null;
export const RECORD_PATHS: Record<'card' | 'events' | 'clubs' | 'attendance' | 'planner' | 'feedback' | 'competitions' | 'resources', string>;
export function deriveEntries(records: Record<string, any>): Entry[];
export function voucherCode(prefix: string, bytes: Uint8Array): string;
export function readVoucherCode(text: string): string | null;
