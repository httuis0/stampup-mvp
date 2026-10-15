// ============================================================
// POS & External Integrations Utility
// Manages API keys, Webhooks, and Cashier Terminal Pairing Codes
// for Square, Clover, Shopify POS, Loyverse, and custom webhooks.
// ============================================================

import { supabase } from '../lib/supabase';

export interface PosIntegrationDetails {
  apiKey: string;
  terminalCode: string;
  webhookUrl: string;
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://wzfvqasbkywvxskvceur.supabase.co';

export const getPosWebhookUrl = (): string => {
  return `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/pos_add_stamp`;
};

/**
 * Regenerate a fresh POS secret API key
 */
export async function regenerateApiKey(shopId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('generate_shop_api_key', {
      p_shop_id: shopId,
    });

    if (!error && data?.status === 'ok') {
      return data.api_key;
    }
    return null;
  } catch (e) {
    console.error('Error generating API key:', e);
    return null;
  }
}

/**
 * Refresh 6-digit terminal pairing code
 */
export async function refreshTerminalCode(shopId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('generate_pos_terminal_code', {
      p_shop_id: shopId,
    });

    if (!error && data?.status === 'ok') {
      return data.terminal_code;
    }
    return null;
  } catch (e) {
    console.error('Error refreshing terminal code:', e);
    return null;
  }
}
