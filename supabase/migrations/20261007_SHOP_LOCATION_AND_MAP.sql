-- ============================================================
-- Migration: Add Shop Location, Google Maps, and Shop Number
-- ============================================================

-- 1. Add location and contact fields to shops table
ALTER TABLE public.shops
ADD COLUMN IF NOT EXISTS shop_number TEXT,
ADD COLUMN IF NOT EXISTS unit_number TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS google_maps_url TEXT;

-- 2. Grant SELECT to public and authenticated for these columns
GRANT SELECT (
    id, name, slug, stamps_required, reward_text, default_country_code,
    shop_number, unit_number, phone, address, latitude, longitude, google_maps_url
) ON public.shops TO anon, authenticated;

-- 3. Update get_default_shop RPC to include location details
CREATE OR REPLACE FUNCTION public.get_default_shop()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_shop RECORD;
BEGIN
    SELECT slug, name, stamps_required, reward_text, default_country_code,
           shop_number, unit_number, phone, address, latitude, longitude, google_maps_url
    INTO v_shop
    FROM public.shops
    ORDER BY created_at ASC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'no_shops');
    END IF;

    RETURN jsonb_build_object(
        'status', 'ok',
        'slug', v_shop.slug,
        'name', v_shop.name,
        'stamps_required', v_shop.stamps_required,
        'reward_text', v_reward_text,
        'default_country_code', v_shop.default_country_code,
        'shop_number', v_shop.shop_number,
        'unit_number', v_shop.unit_number,
        'phone', v_shop.phone,
        'address', v_shop.address,
        'latitude', v_shop.latitude,
        'longitude', v_shop.longitude,
        'google_maps_url', v_shop.google_maps_url
    );
END;
$$;

-- 4. Update get_card to return location & shop number to customer web
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
    v_norm_phone TEXT;
    v_stamps INT := 0;
    v_cust_id UUID;
    v_cust_name TEXT;
BEGIN
    -- 1. Find shop by slug
    SELECT id, name, stamps_required, reward_text, default_country_code, shop_number, address, google_maps_url
    INTO v_shop_id, v_shop_name, v_stamps_req, v_reward_text, v_default_cc, v_shop_num, v_address, v_maps_url
    FROM public.shops
    WHERE slug = lower(trim(p_shop_slug));

    -- Fallback to primary shop if not found
    IF NOT FOUND THEN
        SELECT id, name, stamps_required, reward_text, default_country_code, shop_number, address, google_maps_url
        INTO v_shop_id, v_shop_name, v_stamps_req, v_reward_text, v_default_cc, v_shop_num, v_address, v_maps_url
        FROM public.shops
        ORDER BY created_at ASC
        LIMIT 1;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('status', 'shop_not_found', 'message', 'Shop not found.');
        END IF;
    END IF;

    -- 2. Normalize customer phone
    v_norm_phone := public.normalize_phone(p_phone, COALESCE(v_default_cc, '+971'));
    IF v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('status', 'invalid_phone', 'message', 'Please check the phone number.');
    END IF;

    -- 3. Lookup customer
    SELECT id, current_stamps, name
    INTO v_cust_id, v_stamps, v_cust_name
    FROM public.customers
    WHERE shop_id = v_shop_id AND phone = v_norm_phone;

    -- Save name if customer provided one and it wasn't recorded yet
    IF v_cust_id IS NOT NULL AND p_name IS NOT NULL AND trim(p_name) <> '' AND (v_cust_name IS NULL OR v_cust_name = '') THEN
        UPDATE public.customers SET name = trim(p_name) WHERE id = v_cust_id;
        v_cust_name := trim(p_name);
    END IF;

    IF v_stamps IS NULL THEN
        v_stamps := 0;
    END IF;

    RETURN jsonb_build_object(
        'status', 'ok',
        'shop_name', v_shop_name,
        'reward_text', v_reward_text,
        'stamps_required', v_stamps_req,
        'current_stamps', v_stamps,
        'customer_name', COALESCE(v_cust_name, trim(p_name), ''),
        'shop_number', COALESCE(v_shop_num, ''),
        'address', COALESCE(v_address, ''),
        'google_maps_url', COALESCE(v_maps_url, '')
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_default_shop() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_card(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_card(TEXT, TEXT) TO anon, authenticated;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
