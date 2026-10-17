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
 * Relay a queued WhatsApp message in the background to an external WhatsApp API Gateway.
 * Auto-detects provider format:
 * - Green-API (api.green-api.com -> chatId: "<digits>@c.us", message)
 * - UltraMsg (api.ultramsg.com -> token, to: "+<digits>", body)
 * - TextMeBot / CallMeBot (api.textmebot.com / api.callmebot.com -> GET query params)
 * - Meta WhatsApp Cloud API (graph.facebook.com -> messaging_product: "whatsapp", to, text: { body })
 * - Generic Webhook (Make, Zapier, n8n, custom server)
 */
export async function relayWhatsAppOutboxMessage(
  webhookUrl: string | null | undefined,
  apiToken: string | null | undefined,
  recipientPhone: string,
  messageText: string,
  outboxId?: string
): Promise<{ ok: boolean; error?: string }> {
  if (!webhookUrl || !webhookUrl.trim()) {
    return { ok: false, error: 'WhatsApp Gateway URL is not configured.' };
  }

  try {
    let targetUrl = webhookUrl.trim();
    const token = apiToken?.trim() || '';
    const cleanDigits = recipientPhone.replace(/[^0-9]/g, '');
    const e164Phone = '+' + cleanDigits;

    let res: Response;

    if (targetUrl.includes('textmebot.com') || targetUrl.includes('callmebot.com')) {
      // TextMeBot / CallMeBot GET API
      const sep = targetUrl.includes('?') ? '&' : '?';
      const fullUrl = `${targetUrl}${sep}recipient=${encodeURIComponent(e164Phone)}&phone=${encodeURIComponent(e164Phone)}&apikey=${encodeURIComponent(token)}&text=${encodeURIComponent(messageText)}`;
      res = await fetch(fullUrl, { method: 'GET' });
    } else if (targetUrl.includes('green-api.com')) {
      // Green-API format
      // If user only pasted base instance URL without token at end, append token if needed
      if (token && !targetUrl.endsWith(token) && targetUrl.includes('/sendMessage')) {
        targetUrl = `${targetUrl.replace(/\/+$/, '')}/${token}`;
      }
      res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: `${cleanDigits}@c.us`,
          message: messageText,
        }),
      });
    } else if (targetUrl.includes('ultramsg.com')) {
      // UltraMsg format
      if (!targetUrl.endsWith('/messages/chat')) {
        targetUrl = `${targetUrl.replace(/\/+$/, '')}/messages/chat`;
      }
      res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          to: e164Phone,
          body: messageText,
        }),
      });
    } else if (targetUrl.includes('graph.facebook.com')) {
      // Official Meta WhatsApp Cloud API
      res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: cleanDigits,
          type: 'text',
          text: { body: messageText },
        }),
      });
    } else {
      // Universal Webhook Payload (Make, Zapier, Wati, Custom Server)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      res = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          to: e164Phone,
          phone: e164Phone,
          chatId: `${cleanDigits}@c.us`,
          recipient_phone: e164Phone,
          body: messageText,
          message: messageText,
          text: { body: messageText },
          token: token || undefined,
        }),
      });
    }

    const ok = res.ok;
    let errText = '';
    if (!ok) {
      try {
        errText = await res.text();
      } catch {}
    }

    if (outboxId) {
      await supabase
        .from('whatsapp_outbox')
        .update({
          status: ok ? 'sent' : 'failed',
          sent_at: ok ? new Date().toISOString() : null,
          error_message: ok ? null : `HTTP ${res.status}: ${errText.slice(0, 120)}`,
        })
        .eq('id', outboxId);
    }

    return { ok, error: ok ? undefined : `HTTP ${res.status} ${errText.slice(0, 80)}` };
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
    return { ok: false, error: err?.message || 'Network error' };
  }
}
