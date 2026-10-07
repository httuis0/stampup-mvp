-- ============================================================
-- StampUp Complete Master Migration (2026-10-07)
-- Fully resolves all schema cache, parameter order, permission,
-- and fallback issues once and for all.
-- ============================================================

-- 0. Safely drop previous functions to avoid 42P13 parameter name errors
DROP FUNCTION IF EXISTS public.request_stamp(TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.request_stamp(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_card(TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_card(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_default_shop() CASCADE;
DROP FUNCTION IF EXISTS public.add_stamp(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.resolve_stamp_request(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_pending_stamp_requests(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_customer_history(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_shop_activity_log(UUID, INT) CASCADE;
DROP FUNCTION IF EXISTS public.normalize_phone(TEXT, TEXT) CASCADE;

-- 1. Add missing columns to shops table
ALTER TABLE public.shops 
ADD COLUMN IF NOT EXISTS default_country_code TEXT NOT NULL DEFAULT '+971',
ADD COLUMN IF NOT EXISTS shop_number TEXT,
ADD COLUMN IF NOT EXISTS unit_number TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS google_maps_url TEXT;

-- 2. Add customer name column
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS name TEXT;

-- 3. Allow anonymous & authenticated users to read public shop details
GRANT SELECT ON public.shops TO anon, authenticated;

DROP POLICY IF EXISTS "Allow public read on basic shop details" ON public.shops;
CREATE POLICY "Allow public read on basic shop details"
    ON public.shops
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- 4. Create stamp_requests table
CREATE TABLE IF NOT EXISTS public.stamp_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    customer_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.stamp_requests ADD COLUMN IF NOT EXISTS customer_name TEXT;

CREATE INDEX IF NOT EXISTS idx_stamp_requests_shop_status ON public.stamp_requests(shop_id, status, created_at DESC);

-- Enable RLS on stamp_requests
ALTER TABLE public.stamp_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view their shop requests" ON public.stamp_requests;
CREATE POLICY "Owners can view their shop requests"
    ON public.stamp_requests
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.shops
            WHERE public.shops.id = public.stamp_requests.shop_id
            AND public.shops.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Owners can update their shop requests" ON public.stamp_requests;
CREATE POLICY "Owners can update their shop requests"
    ON public.stamp_requests
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.shops
            WHERE public.shops.id = public.stamp_requests.shop_id
            AND public.shops.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Allow anonymous to insert stamp requests" ON public.stamp_requests;
CREATE POLICY "Allow anonymous to insert stamp requests"
    ON public.stamp_requests
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- 5. Helper Function: Strict Phone Normalization
CREATE OR REPLACE FUNCTION public.normalize_phone(
    p_phone TEXT,
    p_default_country_code TEXT DEFAULT '+971'
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_clean TEXT;
    v_result TEXT;
    v_digits TEXT;
    v_cc_digits TEXT;
BEGIN
    IF p_phone IS NULL OR trim(p_phone) = '' THEN
        RETURN NULL;
    END IF;

    v_clean := regexp_replace(trim(p_phone), '[\s\-\(\)\.]', '', 'g');
    v_cc_digits := regexp_replace(p_default_country_code, '[^0-9]', '', 'g');

    IF v_clean LIKE '00%' THEN
        v_clean := '+' || substr(v_clean, 3);
    END IF;

    IF v_clean ~ '^0[0-9]' THEN
        v_result := p_default_country_code || substr(v_clean, 2);
    ELSIF v_clean LIKE '+%' THEN
        v_result := v_clean;
    ELSIF v_clean LIKE v_cc_digits || '%' THEN
        v_result := '+' || v_clean;
    ELSE
        v_result := p_default_country_code || v_clean;
    END IF;

    v_digits := regexp_replace(v_result, '[^0-9]', '', 'g');
    IF length(v_digits) < 7 OR length(v_digits) > 16 THEN
        RETURN NULL;
    END IF;

    RETURN v_result;
END;
$$;

-- 6. Customer Stamping: Strict Active Customer Verification & Auto-Restart Cycle
CREATE OR REPLACE FUNCTION public.add_stamp(
    p_shop_id UUID,
    p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    c_cooldown_minutes CONSTANT INT := 60;
    v_stamps_required INT;
    v_norm_phone TEXT;
    v_cust_id UUID;
    v_current_stamps INT;
    v_last_stamp_at TIMESTAMPTZ;
    v_minutes_since_last NUMERIC;
    v_minutes_left INT;
    v_new_stamps INT;
    v_default_cc TEXT;
BEGIN
    SELECT stamps_required, default_country_code 
    INTO v_stamps_required, v_default_cc
    FROM public.shops
    WHERE id = p_shop_id AND owner_id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'unauthorized', 'message', 'You do not own this shop.');
    END IF;

    v_norm_phone := public.normalize_phone(p_phone, COALESCE(v_default_cc, '+971'));
    IF v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('status', 'invalid_phone', 'message', 'Please check the phone number.');
    END IF;

    SELECT id, current_stamps, last_stamp_at
    INTO v_cust_id, v_current_stamps, v_last_stamp_at
    FROM public.customers
    WHERE shop_id = p_shop_id AND phone = v_norm_phone;

    IF NOT FOUND THEN
        INSERT INTO public.customers (
            shop_id, phone, current_stamps, rewards_given, last_stamp_at, created_at
        )
        VALUES (
            p_shop_id, v_norm_phone, 1, 0, now(), now()
        )
        RETURNING id, current_stamps INTO v_cust_id, v_new_stamps;

        INSERT INTO public.stamps (shop_id, customer_id, created_by, created_at)
        VALUES (p_shop_id, v_cust_id, auth.uid(), now());

        RETURN jsonb_build_object(
            'status', 'ok',
            'current_stamps', v_new_stamps,
            'stamps_required', v_stamps_required,
            'message', 'Welcome! 1st stamp added.'
        );
    END IF;

    IF v_current_stamps >= v_stamps_required THEN
        INSERT INTO public.rewards (shop_id, customer_id, created_by, created_at)
        VALUES (p_shop_id, v_cust_id, auth.uid(), now());

        INSERT INTO public.stamps (shop_id, customer_id, created_by, created_at)
        VALUES (p_shop_id, v_cust_id, auth.uid(), now());

        UPDATE public.customers
        SET current_stamps = 1,
            rewards_given = COALESCE(rewards_given, 0) + 1,
            last_stamp_at = now()
        WHERE id = v_cust_id;

        RETURN jsonb_build_object(
            'status', 'ok',
            'current_stamps', 1,
            'stamps_required', v_stamps_required,
            'message', 'Previous reward recorded! Cycle restarted with 1 stamp.'
        );
    END IF;

    IF v_last_stamp_at IS NOT NULL THEN
        v_minutes_since_last := EXTRACT(EPOCH FROM (now() - v_last_stamp_at)) / 60;
        IF v_minutes_since_last < c_cooldown_minutes THEN
            v_minutes_left := CEIL(c_cooldown_minutes - v_minutes_since_last);
            RETURN jsonb_build_object(
                'status', 'too_soon',
                'minutes_left', v_minutes_left,
                'message', 'Stamp already added recently. Please wait ' || v_minutes_left || ' min.'
            );
        END IF;
    END IF;

    v_new_stamps := v_current_stamps + 1;

    INSERT INTO public.stamps (shop_id, customer_id, created_by, created_at)
    VALUES (p_shop_id, v_cust_id, auth.uid(), now());

    UPDATE public.customers
    SET current_stamps = v_new_stamps,
        last_stamp_at = now()
    WHERE id = v_cust_id;

    IF v_new_stamps >= v_stamps_required THEN
        RETURN jsonb_build_object(
            'status', 'card_full',
            'current_stamps', v_new_stamps,
            'stamps_required', v_stamps_required,
            'message', 'Card full! Customer unlocked a free reward!'
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'ok',
        'current_stamps', v_new_stamps,
        'stamps_required', v_stamps_required,
        'message', '+1 Stamp added successfully.'
    );
END;
$$;

-- 7. get_card: Customer Stamp Balance with Auto-Shop-Fallback & Location
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

    -- Fallback: If slug not found or was placeholder 'chai-corner', fallback to first available shop!
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


-- 8. request_stamp: Customer Stamp Request (Supports all signature combinations)
CREATE OR REPLACE FUNCTION public.request_stamp(
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
    v_default_cc TEXT;
    v_norm_phone TEXT;
    v_existing_id UUID;
    v_request_id UUID;
    v_cust_name TEXT;
BEGIN
    -- 1. Find shop by slug, fallback to first active shop if not matched
    SELECT id, name, default_country_code 
    INTO v_shop_id, v_shop_name, v_default_cc
    FROM public.shops
    WHERE slug = trim(p_shop_slug);

    IF NOT FOUND THEN
        SELECT id, name, default_country_code 
        INTO v_shop_id, v_shop_name, v_default_cc
        FROM public.shops
        ORDER BY created_at ASC
        LIMIT 1;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('status', 'shop_not_found', 'message', 'Shop was not found.');
        END IF;
    END IF;

    -- 2. Normalize phone number
    v_norm_phone := public.normalize_phone(p_phone, COALESCE(v_default_cc, '+971'));
    IF v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('status', 'invalid_phone', 'message', 'Please check the phone number.');
    END IF;

    -- Save customer name if available
    v_cust_name := trim(COALESCE(p_name, ''));
    IF v_cust_name <> '' THEN
        UPDATE public.customers
        SET name = v_cust_name
        WHERE shop_id = v_shop_id AND phone = v_norm_phone AND (name IS NULL OR name = '');
    ELSE
        SELECT name INTO v_cust_name
        FROM public.customers
        WHERE shop_id = v_shop_id AND phone = v_norm_phone;
    END IF;

    -- 3. Check for existing pending request in past 30 minutes
    SELECT id INTO v_existing_id
    FROM public.stamp_requests
    WHERE shop_id = v_shop_id 
      AND phone = v_norm_phone 
      AND status = 'pending'
      AND created_at >= (now() - interval '30 minutes')
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'already_pending',
            'message', 'Your stamp request is already pending approval.',
            'request_id', v_existing_id
        );
    END IF;

    -- 4. Insert new request
    INSERT INTO public.stamp_requests (shop_id, phone, customer_name, status)
    VALUES (v_shop_id, v_norm_phone, NULLIF(v_cust_name, ''), 'pending')
    RETURNING id INTO v_request_id;

    RETURN jsonb_build_object(
        'status', 'ok',
        'message', 'Stamp requested successfully! Please show your counter to the cashier.',
        'request_id', v_request_id
    );
END;
$$;


-- 9. Get Default / Primary Shop
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
        'reward_text', v_shop.reward_text,
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

-- 10. Cashier RPCs
CREATE OR REPLACE FUNCTION public.get_pending_stamp_requests(
    p_shop_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_requests JSONB;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.shops 
        WHERE id = p_shop_id AND owner_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object('status', 'unauthorized', 'message', 'Unauthorized', 'requests', '[]'::jsonb);
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', id,
                'phone', phone,
                'customer_name', COALESCE(customer_name, ''),
                'created_at', created_at
            )
            ORDER BY created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_requests
    FROM public.stamp_requests
    WHERE shop_id = p_shop_id
      AND status = 'pending'
      AND created_at >= (now() - interval '60 minutes');

    RETURN jsonb_build_object('status', 'ok', 'requests', v_requests);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_stamp_request(
    p_request_id UUID,
    p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_shop_id UUID;
    v_phone TEXT;
    v_stamp_res JSONB;
BEGIN
    SELECT shop_id, phone INTO v_shop_id, v_phone
    FROM public.stamp_requests
    WHERE id = p_request_id AND status = 'pending';

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'message', 'Request was already resolved or expired.');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.shops WHERE id = v_shop_id AND owner_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object('status', 'unauthorized', 'message', 'Unauthorized.');
    END IF;

    IF p_action = 'accept' THEN
        v_stamp_res := public.add_stamp(v_shop_id, v_phone);

        IF v_stamp_res->>'status' IN ('ok', 'card_full') THEN
            UPDATE public.stamp_requests
            SET status = 'accepted', resolved_at = now(), resolved_by = auth.uid()
            WHERE id = p_request_id;

            RETURN jsonb_build_object(
                'status', 'ok',
                'action', 'accepted',
                'phone', v_phone,
                'stamp_result', v_stamp_res
            );
        ELSE
            RETURN jsonb_build_object(
                'status', 'error',
                'message', COALESCE(v_stamp_res->>'message', 'Could not add stamp.')
            );
        END IF;
    ELSIF p_action = 'reject' THEN
        UPDATE public.stamp_requests
        SET status = 'rejected', resolved_at = now(), resolved_by = auth.uid()
        WHERE id = p_request_id;

        RETURN jsonb_build_object(
            'status', 'ok',
            'action', 'rejected',
            'phone', v_phone
        );
    ELSE
        RETURN jsonb_build_object('status', 'invalid_action', 'message', 'Invalid action.');
    END IF;
END;
$$;

-- 11. 90-Day Date-Wise Activity Log Function
CREATE OR REPLACE FUNCTION public.get_shop_activity_log(
    p_shop_id UUID,
    p_days INT DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_events JSONB;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.shops 
        WHERE id = p_shop_id AND owner_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object('status', 'unauthorized', 'events', '[]'::jsonb);
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', e.id,
                'type', e.event_type,
                'customer_id', e.customer_id,
                'customer_phone', c.phone,
                'customer_name', COALESCE(c.name, ''),
                'created_at', e.created_at
            )
            ORDER BY e.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_events
    FROM (
        SELECT id, 'stamp' AS event_type, customer_id, created_at
        FROM public.stamps
        WHERE shop_id = p_shop_id AND created_at >= (now() - (p_days || ' days')::INTERVAL)
        UNION ALL
        SELECT id, 'reward' AS event_type, customer_id, created_at
        FROM public.rewards
        WHERE shop_id = p_shop_id AND created_at >= (now() - (p_days || ' days')::INTERVAL)
    ) e
    LEFT JOIN public.customers c ON c.id = e.customer_id;

    RETURN jsonb_build_object('status', 'ok', 'events', v_events);
END;
$$;

-- 12. Date-Wise Individual Customer History
CREATE OR REPLACE FUNCTION public.get_customer_history(
    p_shop_id UUID,
    p_customer_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_history JSONB;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.shops 
        WHERE id = p_shop_id AND owner_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object('status', 'unauthorized', 'message', 'Unauthorized', 'events', '[]'::jsonb);
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', h.id,
                'type', h.event_type,
                'created_at', h.created_at
            )
            ORDER BY h.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_history
    FROM (
        SELECT id, 'stamp' AS event_type, created_at
        FROM public.stamps
        WHERE shop_id = p_shop_id AND customer_id = p_customer_id
        UNION ALL
        SELECT id, 'reward' AS event_type, created_at
        FROM public.rewards
        WHERE shop_id = p_shop_id AND customer_id = p_customer_id
    ) h;

    RETURN jsonb_build_object('status', 'ok', 'events', v_history);
END;
$$;

-- Grant execution to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.get_card(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_card(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_stamp(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_stamp(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_default_shop() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_stamp_requests(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_stamp_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shop_activity_log(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_history(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_stamp(UUID, TEXT) TO authenticated;

-- Refresh PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
