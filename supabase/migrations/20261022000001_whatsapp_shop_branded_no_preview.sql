-- ============================================================
-- WhatsApp: send as the shop's own plain message (no app link-preview card / logo)
-- Re-creates the server-side pg_net dispatcher with link previews disabled.
-- ============================================================

CREATE OR REPLACE FUNCTION public.send_whatsapp_via_pg_net(
  p_shop_id UUID,
  p_phone TEXT,
  p_text TEXT,
  p_outbox_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url TEXT;
  v_token TEXT;
  v_digits TEXT;
  v_headers JSONB;
  v_body JSONB;
BEGIN
  SELECT trim(whatsapp_webhook_url), trim(whatsapp_api_token)
  INTO v_url, v_token
  FROM public.shops
  WHERE id = p_shop_id;

  IF v_url IS NULL OR v_url = '' THEN
    RETURN FALSE;
  END IF;

  v_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF v_digits = '' THEN
    RETURN FALSE;
  END IF;

  v_headers := jsonb_build_object('Content-Type', 'application/json');
  IF v_token IS NOT NULL AND v_token <> '' THEN
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_token);
  END IF;

  -- Provider 1: Green-API (sends from the shop's own linked WhatsApp number)
  IF lower(v_url) LIKE '%green-api.com%' THEN
    v_body := jsonb_build_object(
      'chatId', v_digits || '@c.us',
      'message', p_text,
      'linkPreview', false
    );
    PERFORM net.http_post(url := v_url, body := v_body, headers := '{"Content-Type": "application/json"}'::jsonb);

  -- Provider 2: UltraMsg
  ELSIF lower(v_url) LIKE '%ultramsg.com%' THEN
    v_body := jsonb_build_object(
      'token', COALESCE(v_token, ''),
      'to', '+' || v_digits,
      'body', p_text
    );
    PERFORM net.http_post(url := v_url, body := v_body, headers := '{"Content-Type": "application/json"}'::jsonb);

  -- Provider 3: Meta WhatsApp Cloud API
  ELSIF lower(v_url) LIKE '%graph.facebook.com%' THEN
    v_body := jsonb_build_object(
      'messaging_product', 'whatsapp',
      'recipient_type', 'individual',
      'to', v_digits,
      'type', 'text',
      'text', jsonb_build_object('preview_url', false, 'body', p_text)
    );
    PERFORM net.http_post(url := v_url, body := v_body, headers := v_headers);

  -- Provider 4: Generic webhook
  ELSE
    v_body := jsonb_build_object(
      'to', '+' || v_digits,
      'phone', p_phone,
      'chatId', v_digits || '@c.us',
      'message', p_text,
      'text', p_text,
      'body', p_text,
      'token', COALESCE(v_token, ''),
      'outbox_id', p_outbox_id,
      'linkPreview', false
    );
    PERFORM net.http_post(url := v_url, body := v_body, headers := v_headers);
  END IF;

  IF p_outbox_id IS NOT NULL THEN
    UPDATE public.whatsapp_outbox
    SET status = 'sent', sent_at = now()
    WHERE id = p_outbox_id;
  END IF;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;

