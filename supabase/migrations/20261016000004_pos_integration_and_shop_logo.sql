-- ============================================================
-- Migration: Automated POS Bill Stamp + Minimum Limit + Server-Side Auto-WhatsApp + Logo
-- 100% Non-Destructive Migration (No DROP statements)
-- Includes pg_net Server-Side Background WhatsApp Execution
-- ============================================================

-- 0. Enable pg_net for 100% server-side background HTTP requests (even when app is closed)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Add logo_url, POS API key, terminal code, minimum bill limit, and WhatsApp gateway to shops
ALTER TABLE public.shops
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS api_key TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS pos_terminal_code TEXT,
ADD COLUMN IF NOT EXISTS min_bill_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS whatsapp_webhook_url TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_api_token TEXT;

-- Generate initial API keys and terminal codes for existing shops if null
UPDATE public.shops
SET 
  api_key = COALESCE(api_key, 'sp_live_' || encode(gen_random_bytes(16), 'hex')),
  pos_terminal_code = COALESCE(pos_terminal_code, LPAD(FLOOR(random() * 900000 + 100000)::TEXT, 6, '0')),
  min_bill_amount = COALESCE(min_bill_amount, 0)
WHERE api_key IS NULL OR pos_terminal_code IS NULL OR min_bill_amount IS NULL;

-- 2. Grant SELECT and UPDATE permissions for the new columns
GRANT SELECT (id, name, slug, stamps_required, reward_text, default_country_code, shop_number, phone, address, latitude, longitude, google_maps_url, stamp_icon, logo_url, api_key, pos_terminal_code, min_bill_amount, whatsapp_webhook_url, whatsapp_api_token)
ON public.shops TO anon, authenticated;

GRANT UPDATE (name, slug, stamps_required, reward_text, default_country_code, shop_number, phone, address, latitude, longitude, google_maps_url, stamp_icon, logo_url, min_bill_amount, whatsapp_webhook_url, whatsapp_api_token)
ON public.shops TO authenticated;

-- 3. Ensure whatsapp_outbox table exists for automated background WhatsApp delivery
CREATE TABLE IF NOT EXISTS public.whatsapp_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE,
  recipient_phone TEXT NOT NULL,
  message_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

ALTER TABLE public.whatsapp_outbox ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_outbox' AND policyname = 'Shops can view their whatsapp outbox'
  ) THEN
    CREATE POLICY "Shops can view their whatsapp outbox"
      ON public.whatsapp_outbox FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_outbox' AND policyname = 'Shops can insert into whatsapp outbox'
  ) THEN
    CREATE POLICY "Shops can insert into whatsapp outbox"
      ON public.whatsapp_outbox FOR INSERT WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'whatsapp_outbox' AND policyname = 'Shops can update whatsapp outbox'
  ) THEN
    CREATE POLICY "Shops can update whatsapp outbox"
      ON public.whatsapp_outbox FOR UPDATE USING (true);
  END IF;
END $$;

-- 3B. Server-Side Background WhatsApp HTTP Dispatcher (via pg_net)
-- Fires the real HTTP request directly from PostgreSQL so WhatsApp messages send even when all phones/apps are closed.
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

  -- Provider 1: Green-API (green-api.com)
  IF lower(v_url) LIKE '%green-api.com%' THEN
    v_body := jsonb_build_object(
      'chatId', v_digits || '@c.us',
      'message', p_text
    );
    PERFORM net.http_post(url := v_url, body := v_body, headers := '{"Content-Type": "application/json"}'::jsonb);

  -- Provider 2: UltraMsg (ultramsg.com)
  ELSIF lower(v_url) LIKE '%ultramsg.com%' THEN
    v_body := jsonb_build_object(
      'token', COALESCE(v_token, ''),
      'to', '+' || v_digits,
      'body', p_text
    );
    PERFORM net.http_post(url := v_url, body := v_body, headers := '{"Content-Type": "application/json"}'::jsonb);

  -- Provider 3: Meta Official WhatsApp Cloud API (graph.facebook.com)
  ELSIF lower(v_url) LIKE '%graph.facebook.com%' THEN
    v_body := jsonb_build_object(
      'messaging_product', 'whatsapp',
      'recipient_type', 'individual',
      'to', v_digits,
      'type', 'text',
      'text', jsonb_build_object('preview_url', true, 'body', p_text)
    );
    PERFORM net.http_post(url := v_url, body := v_body, headers := v_headers);

  -- Provider 4: Generic Webhook (Make.com, Zapier, n8n, Custom Gateway)
  ELSE
    v_body := jsonb_build_object(
      'to', '+' || v_digits,
      'phone', p_phone,
      'chatId', v_digits || '@c.us',
      'message', p_text,
      'text', p_text,
      'body', p_text,
      'token', COALESCE(v_token, ''),
      'outbox_id', p_outbox_id
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

-- 3C. Update dispatch_whatsapp_message RPC to also fire pg_net immediately
CREATE OR REPLACE FUNCTION public.dispatch_whatsapp_message(
  p_shop_id UUID,
  p_phone TEXT,
  p_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_outbox_id UUID;
  v_sent BOOLEAN;
BEGIN
  INSERT INTO public.whatsapp_outbox (shop_id, recipient_phone, message_text, status, created_at)
  VALUES (p_shop_id, p_phone, p_text, 'queued', now())
  RETURNING id INTO v_outbox_id;

  v_sent := public.send_whatsapp_via_pg_net(p_shop_id, p_phone, p_text, v_outbox_id);

  RETURN jsonb_build_object(
    'status', 'ok',
    'outbox_id', v_outbox_id,
    'dispatched_server_side', v_sent
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_whatsapp_message(UUID, TEXT, TEXT) TO anon, authenticated, service_role;

-- 4. RPC to generate or regenerate a Shop POS API Key
CREATE OR REPLACE FUNCTION public.generate_shop_api_key(p_shop_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_key TEXT;
BEGIN
  v_new_key := 'sp_live_' || encode(gen_random_bytes(16), 'hex');

  UPDATE public.shops
  SET api_key = v_new_key
  WHERE id = p_shop_id AND (owner_id = auth.uid() OR auth.role() = 'service_role');

  RETURN jsonb_build_object(
    'status', 'ok',
    'api_key', v_new_key
  );
END;
$$;

-- 5. RPC to generate or refresh 6-digit Cashier Terminal Pairing Code
CREATE OR REPLACE FUNCTION public.generate_pos_terminal_code(p_shop_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_code TEXT;
BEGIN
  v_new_code := LPAD(FLOOR(random() * 900000 + 100000)::TEXT, 6, '0');

  UPDATE public.shops
  SET pos_terminal_code = v_new_code
  WHERE id = p_shop_id AND (owner_id = auth.uid() OR auth.role() = 'service_role');

  RETURN jsonb_build_object(
    'status', 'ok',
    'terminal_code', v_new_code
  );
END;
$$;

-- 6. FULLY AUTOMATED POS BILL PUNCH RPC
-- Triggered automatically when a cashier punches a bill on the POS with customer phone & amount.
-- Checks minimum bill limit -> Instantly awards stamp -> Automatically fires server-side WhatsApp via pg_net!
CREATE OR REPLACE FUNCTION public.pos_add_stamp(
  p_api_key TEXT,
  p_phone TEXT,
  p_amount NUMERIC DEFAULT NULL,
  p_order_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop RECORD;
  v_norm_phone TEXT;
  v_cust_id UUID;
  v_current_stamps INT;
  v_new_stamps INT;
  v_remaining INT;
  v_status TEXT;
  v_msg TEXT;
  v_wa_text TEXT;
  v_card_url TEXT;
  v_outbox_id UUID;
  v_min_limit NUMERIC;
  v_server_sent BOOLEAN;
BEGIN
  -- A. Authenticate Shop via POS API Key or 6-Digit Terminal Code
  SELECT * INTO v_shop
  FROM public.shops
  WHERE api_key = trim(p_api_key) OR pos_terminal_code = trim(p_api_key);

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'unauthorized',
      'message', 'Invalid or inactive POS API key / terminal code.'
    );
  END IF;

  -- B. Check Minimum Bill Amount Requirement
  v_min_limit := COALESCE(v_shop.min_bill_amount, 0);
  IF v_min_limit > 0 THEN
    IF p_amount IS NULL OR p_amount < v_min_limit THEN
      RETURN jsonb_build_object(
        'status', 'below_minimum',
        'shop_name', v_shop.name,
        'amount', COALESCE(p_amount, 0),
        'min_bill_amount', v_min_limit,
        'message', format('Bill amount (%s) is below the minimum limit (%s) required to earn a stamp.', COALESCE(p_amount, 0), v_min_limit)
      );
    END IF;
  END IF;

  -- C. Normalize Customer Phone Number
  v_norm_phone := public.normalize_phone(p_phone, COALESCE(v_shop.default_country_code, '+971'));
  IF v_norm_phone IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'invalid_phone',
      'message', 'Invalid customer phone number format.'
    );
  END IF;

  -- D. Find or Automatically Create Customer (Zero manual steps needed)
  SELECT id, current_stamps
  INTO v_cust_id, v_current_stamps
  FROM public.customers
  WHERE shop_id = v_shop.id AND phone = v_norm_phone;

  IF NOT FOUND THEN
    INSERT INTO public.customers (shop_id, phone, current_stamps, rewards_given)
    VALUES (v_shop.id, v_norm_phone, 0, 0)
    RETURNING id, current_stamps
    INTO v_cust_id, v_current_stamps;
  END IF;

  -- E. Calculate New Stamp Count & Award Instant Stamp
  v_new_stamps := LEAST(v_shop.stamps_required, COALESCE(v_current_stamps, 0) + 1);

  UPDATE public.customers
  SET current_stamps = v_new_stamps,
      last_stamp_at = now()
  WHERE id = v_cust_id;

  INSERT INTO public.stamps (customer_id, shop_id, created_by)
  VALUES (v_cust_id, v_shop.id, v_shop.owner_id);

  -- F. Build Automated WhatsApp Message & Digital Card Link
  v_card_url := 'https://stampup-cards.vercel.app/c/' || COALESCE(v_shop.slug, 'shop') || '?phone=' || replace(v_norm_phone, '+', '%2B');

  IF v_new_stamps >= v_shop.stamps_required THEN
    v_status := 'card_full';
    v_msg := format('Card Full! Customer has %s of %s stamps and unlocked: %s', v_new_stamps, v_shop.stamps_required, v_shop.reward_text);
    v_wa_text := format(
      E'🎉 *Congratulations from %s!*\n\nThank you for your purchase%s! Your loyalty card is now FULL (%s/%s stamps ⭐)!\n🎁 You have unlocked your *Free %s*!\n\nView your live digital pass:\n%s',
      v_shop.name,
      CASE WHEN p_amount IS NOT NULL AND p_amount > 0 THEN format(' (Bill: %s)', p_amount) ELSE '' END,
      v_new_stamps,
      v_shop.stamps_required,
      v_shop.reward_text,
      v_card_url
    );
  ELSE
    v_status := 'ok';
    v_remaining := GREATEST(0, v_shop.stamps_required - v_new_stamps);
    v_msg := format('Instant stamp added! Customer now has %s of %s stamps.', v_new_stamps, v_shop.stamps_required);
    v_wa_text := format(
      E'☕ *%s — Instant Loyalty Stamp Added!*\n\nThank you for your purchase%s! You earned +1 stamp and now have *%s of %s stamps* ⭐.\n🎯 Only *%s more stamp%s* to earn a free *%s*!\n\nView your live digital pass:\n%s',
      v_shop.name,
      CASE WHEN p_amount IS NOT NULL AND p_amount > 0 THEN format(' (Bill: %s)', p_amount) ELSE '' END,
      v_new_stamps,
      v_shop.stamps_required,
      v_remaining,
      CASE WHEN v_remaining = 1 THEN '' ELSE 's' END,
      v_shop.reward_text,
      v_card_url
    );
  END IF;

  -- G. Queue & Immediately Fire Server-Side WhatsApp Message in Background
  INSERT INTO public.whatsapp_outbox (
    shop_id,
    recipient_phone,
    message_text,
    status,
    created_at
  )
  VALUES (
    v_shop.id,
    v_norm_phone,
    v_wa_text,
    'queued',
    now()
  )
  RETURNING id INTO v_outbox_id;

  v_server_sent := public.send_whatsapp_via_pg_net(v_shop.id, v_norm_phone, v_wa_text, v_outbox_id);

  -- H. Return Complete Automated POS Response
  RETURN jsonb_build_object(
    'status', v_status,
    'shop_name', v_shop.name,
    'phone', v_norm_phone,
    'current_stamps', v_new_stamps,
    'stamps_required', v_shop.stamps_required,
    'reward_text', v_shop.reward_text,
    'amount', p_amount,
    'min_bill_amount', v_min_limit,
    'order_id', p_order_id,
    'whatsapp_queued', true,
    'whatsapp_dispatched_server_side', v_server_sent,
    'outbox_id', v_outbox_id,
    'whatsapp_message', v_wa_text,
    'message', v_msg
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_add_stamp(TEXT, TEXT, NUMERIC, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_shop_api_key(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_pos_terminal_code(UUID) TO authenticated, service_role;

-- 7. RPC to pair terminal device with a 6-digit code
CREATE OR REPLACE FUNCTION public.pair_pos_terminal(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shop RECORD;
BEGIN
  SELECT id, name, slug, stamps_required, reward_text, logo_url, default_country_code, min_bill_amount, api_key
  INTO v_shop
  FROM public.shops
  WHERE pos_terminal_code = trim(p_code) OR api_key = trim(p_code);

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'message', 'Invalid terminal pairing code. Please check your POS settings in the Manager Dashboard.'
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'shop', row_to_json(v_shop)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pair_pos_terminal(TEXT) TO anon, authenticated, service_role;

-- 8. Supabase Storage Bucket setup for Shop Logos (Non-destructive policy check)
INSERT INTO storage.buckets (id, name, public)
VALUES ('shop-logos', 'shop-logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Public Access to Shop Logos'
  ) THEN
    CREATE POLICY "Public Access to Shop Logos"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'shop-logos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated Users can upload shop logos'
  ) THEN
    CREATE POLICY "Authenticated Users can upload shop logos"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'shop-logos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Authenticated Users can update shop logos'
  ) THEN
    CREATE POLICY "Authenticated Users can update shop logos"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'shop-logos');
  END IF;
END $$;

-- 9. Update get_card RPC to return logo_url to customer web
CREATE OR REPLACE FUNCTION public.get_card(
    p_shop_slug TEXT,
    p_phone TEXT,
    p_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_shop_id UUID;
    v_shop_name TEXT;
    v_stamps_req INT;
    v_reward_text TEXT;
    v_default_cc TEXT;
    v_shop_num TEXT;
    v_address TEXT;
    v_maps_url TEXT;
    v_stamp_icon TEXT;
    v_logo_url TEXT;
    v_norm_phone TEXT;
    v_stamps INT := 0;
    v_cust_id UUID;
    v_cust_name TEXT;
BEGIN
    SELECT id, name, stamps_required, reward_text, default_country_code, shop_number, address, google_maps_url, stamp_icon, logo_url
    INTO v_shop_id, v_shop_name, v_stamps_req, v_reward_text, v_default_cc, v_shop_num, v_address, v_maps_url, v_stamp_icon, v_logo_url
    FROM public.shops
    WHERE slug = lower(trim(p_shop_slug));

    IF NOT FOUND THEN
        SELECT id, name, stamps_required, reward_text, default_country_code, shop_number, address, google_maps_url, stamp_icon, logo_url
        INTO v_shop_id, v_shop_name, v_stamps_req, v_reward_text, v_default_cc, v_shop_num, v_address, v_maps_url, v_stamp_icon, v_logo_url
        FROM public.shops
        ORDER BY created_at ASC
        LIMIT 1;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('status', 'shop_not_found', 'message', 'Shop not found.');
        END IF;
    END IF;

    v_norm_phone := public.normalize_phone(p_phone, COALESCE(v_default_cc, '+971'));
    IF v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('status', 'invalid_phone', 'message', 'Please check the phone number.');
    END IF;

    SELECT id, current_stamps, name
    INTO v_cust_id, v_stamps, v_cust_name
    FROM public.customers
    WHERE shop_id = v_shop_id AND phone = v_norm_phone;

    IF p_name IS NOT NULL AND trim(p_name) <> '' AND v_cust_id IS NOT NULL AND (v_cust_name IS NULL OR v_cust_name = '') THEN
        UPDATE public.customers SET name = trim(p_name) WHERE id = v_cust_id;
        v_cust_name := trim(p_name);
    END IF;

    RETURN jsonb_build_object(
        'status', 'ok',
        'shop_name', v_shop_name,
        'stamps_required', v_stamps_req,
        'reward_text', v_reward_text,
        'current_stamps', COALESCE(v_stamps, 0),
        'customer_name', v_cust_name,
        'is_registered', (v_cust_id IS NOT NULL),
        'default_country_code', v_default_cc,
        'shop_number', v_shop_num,
        'address', v_address,
        'google_maps_url', v_maps_url,
        'stamp_icon', v_stamp_icon,
        'logo_url', v_logo_url
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_card(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_card(TEXT, TEXT) TO anon, authenticated;
