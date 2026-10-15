-- ============================================================
-- Migration: POS & External Integrations + Shop Logo Storage
-- Enables external POS software integration via API keys,
-- cashier terminal pairing codes, and real shop logo storage.
-- ============================================================

-- 1. Add logo_url, api_key, and pos_terminal_code to shops
ALTER TABLE public.shops
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS api_key TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS pos_terminal_code TEXT;

-- Generate initial API keys and terminal codes for existing shops if null
UPDATE public.shops
SET 
  api_key = COALESCE(api_key, 'sp_live_' || encode(gen_random_bytes(16), 'hex')),
  pos_terminal_code = COALESCE(pos_terminal_code, LPAD(FLOOR(random() * 900000 + 100000)::TEXT, 6, '0'))
WHERE api_key IS NULL OR pos_terminal_code IS NULL;

-- 2. Grant SELECT and UPDATE permissions for the new columns
GRANT SELECT (id, name, slug, stamps_required, reward_text, default_country_code, shop_number, phone, address, latitude, longitude, google_maps_url, stamp_icon, logo_url, api_key, pos_terminal_code)
ON public.shops TO anon, authenticated;

-- 3. RPC to generate or regenerate a Shop POS API Key
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

-- 4. RPC to generate or refresh 6-digit Cashier Terminal Pairing Code
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

-- 5. RPC for External POS systems to add stamps via API Key
-- Usable by Square, Clover, Shopify POS, Toast, or custom webhooks
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
  v_res JSONB;
BEGIN
  -- Authenticate via API key
  SELECT * INTO v_shop
  FROM public.shops
  WHERE api_key = trim(p_api_key);

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'unauthorized',
      'message', 'Invalid or inactive POS API key.'
    );
  END IF;

  -- Add stamp via existing business logic
  v_res := public.add_stamp(v_shop.id, trim(p_phone));

  -- Return enriched POS receipt data
  RETURN jsonb_build_object(
    'status', v_res->>'status',
    'shop_name', v_shop.name,
    'phone', trim(p_phone),
    'current_stamps', (v_res->>'current_stamps')::INT,
    'stamps_required', (v_res->>'stamps_required')::INT,
    'reward_text', v_shop.reward_text,
    'order_id', p_order_id,
    'message', v_res->>'message'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_add_stamp(TEXT, TEXT, NUMERIC, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_shop_api_key(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_pos_terminal_code(UUID) TO authenticated, service_role;

-- 6. RPC to pair terminal device with a 6-digit code
CREATE OR REPLACE FUNCTION public.pair_pos_terminal(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shop RECORD;
BEGIN
  SELECT id, name, slug, stamps_required, reward_text, logo_url, default_country_code
  INTO v_shop
  FROM public.shops
  WHERE pos_terminal_code = trim(p_code);

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

-- 7. Supabase Storage Bucket setup for Shop Logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('shop-logos', 'shop-logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage RLS: Public read access for logos
DROP POLICY IF EXISTS "Public Access to Shop Logos" ON storage.objects;
CREATE POLICY "Public Access to Shop Logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'shop-logos');

-- Storage RLS: Authenticated upload/update for logos
DROP POLICY IF EXISTS "Authenticated Users can upload shop logos" ON storage.objects;
CREATE POLICY "Authenticated Users can upload shop logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'shop-logos');

DROP POLICY IF EXISTS "Authenticated Users can update shop logos" ON storage.objects;
CREATE POLICY "Authenticated Users can update shop logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'shop-logos');

-- 8. Update get_card RPC to return logo_url to customer web
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
