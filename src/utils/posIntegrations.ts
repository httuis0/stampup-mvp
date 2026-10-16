// ============================================================
// POS & External Integrations Utility
// Manages API keys, Minimum Bill Rules, Automated WhatsApp Relay,
// and Cashier Terminal Pairing Codes for POS registers.
// ============================================================

import { supabase } from '../lib/supabase';

export interface PosIntegrationDetails {
  apiKey: string;
  terminalCode: string;
  webhookUrl: string;
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://leoleteiwpirmdtfoufa.supabase.co';

export const getPosWebhookUrl = (): string => {
  return `${supabaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '')}/rest/v1/rpc/pos_add_stamp`;
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

/**
 * Save POS Minimum Bill Limit & Automated WhatsApp Gateway Config
 */
export async function savePosAutomationRules(
  shopId: string,
  minBillAmount: number,
  whatsappWebhookUrl?: string | null,
  whatsappApiToken?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('shops')
      .update({
        min_bill_amount: Math.max(0, minBillAmount || 0),
        whatsapp_webhook_url: whatsappWebhookUrl?.trim() || null,
        whatsapp_api_token: whatsappApiToken?.trim() || null,
      })
      .eq('id', shopId);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Failed to save POS rules' };
  }
}

/**
 * Relay a queued WhatsApp message in the background to an external WhatsApp API Gateway
 * (Supports Meta WhatsApp Cloud API, UltraMsg, Wati, Make/Zapier, or Custom Webhooks)
 */
export async function relayWhatsAppOutboxMessage(
  webhookUrl: string | null | undefined,
  apiToken: string | null | undefined,
  recipientPhone: string,
  messageText: string,
  outboxId?: string
): Promise<boolean> {
  if (!webhookUrl || !webhookUrl.trim()) return false;

  try {
    const cleanDigits = recipientPhone.replace(/[^0-9]/g, '');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiToken && apiToken.trim()) {
      headers['Authorization'] = `Bearer ${apiToken.trim()}`;
    }

    // Standard payload compatible with Meta Cloud API, UltraMsg, Wati, and Webhook relays
    const payload = {
      to: cleanDigits,
      phone: recipientPhone,
      recipient_phone: recipientPhone,
      body: messageText,
      message: messageText,
      text: { body: messageText },
      messaging_product: 'whatsapp',
      type: 'text',
      token: apiToken?.trim() || undefined,
    };

    const res = await fetch(webhookUrl.trim(), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (outboxId) {
      await supabase
        .from('whatsapp_outbox')
        .update({
          status: res.ok ? 'sent' : 'failed',
          sent_at: res.ok ? new Date().toISOString() : null,
          error_message: res.ok ? null : `HTTP ${res.status}`,
        })
        .eq('id', outboxId);
    }

    return res.ok;
  } catch (err: any) {
    if (outboxId) {
      await supabase
        .from('whatsapp_outbox')
        .update({
          status: 'failed',
          error_message: err?.message || 'Network error',
        })
        .eq('id', outboxId);
    }
    return false;
  }
}
