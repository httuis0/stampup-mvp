// ============================================================
// TypeScript Type Definitions for StampUp
// ============================================================

export interface Shop {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  stamps_required: number;
  reward_text: string;
  default_country_code?: string;
  created_at: string;
}

export interface StampRequest {
  id: string;
  shop_id: string;
  phone: string;
  customer_name?: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  created_at: string;
  resolved_at?: string | null;
}

export interface Customer {
  id: string;
  shop_id: string;
  phone: string;
  name?: string | null;
  current_stamps: number;
  rewards_given: number;
  last_stamp_at: string | null;
  created_at: string;
}

export interface Stamp {
  id: string;
  shop_id: string;
  customer_id: string;
  created_by: string;
  created_at: string;
}

export interface Reward {
  id: string;
  shop_id: string;
  customer_id: string;
  created_by: string;
  created_at: string;
}

export interface AddStampResponse {
  status: 'ok' | 'card_full' | 'too_soon' | 'invalid_phone' | 'unauthorized' | 'error';
  current_stamps?: number;
  stamps_required?: number;
  minutes_left?: number;
  message?: string;
}

export interface GiveRewardResponse {
  status: 'ok' | 'not_ready' | 'customer_not_found' | 'invalid_phone' | 'unauthorized' | 'error';
  current_stamps?: number;
  stamps_required?: number;
  rewards_given?: number;
  message?: string;
}

export interface GetCardResponse {
  status: 'ok' | 'shop_not_found' | 'invalid_phone' | 'error';
  shop_name?: string;
  reward_text?: string;
  stamps_required?: number;
  current_stamps?: number;
  message?: string;
}

export interface UndoStampResponse {
  status: 'ok' | 'no_stamps' | 'invalid_phone' | 'unauthorized' | 'error';
  current_stamps?: number;
  message?: string;
}

export interface CashierSettings {
  isCashierMode: boolean;
  pin: string | null;
}
