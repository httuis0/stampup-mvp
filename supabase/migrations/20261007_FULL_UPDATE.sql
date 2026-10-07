-- ============================================================
-- StampUp Full Upgrade Migration (2026-10-07)
-- Multi-Country, Customer Name, Live Requests, Active Check,
-- 90-Day Date-Wise Customer Activity, and Auto-Restart Reward Cycle.
-- ============================================================

-- 1. Add default_country_code to shops
ALTER TABLE public.shops 
ADD COLUMN IF NOT EXISTS default_country_code TEXT NOT NULL DEFAULT '+971';

-- 2. Add customer name column
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS name TEXT;

-- 3. Allow anonymous users to view public shop details by slug / default
GRANT SELECT (id, name, slug, stamps_required, reward_text, default_country_code) ON public.shops TO anon, authenticated;

DROP POLICY IF EXISTS "Allow public read on basic shop details" ON public.shops;
CREATE POLICY "Allow public read on basic shop details"
    ON public.shops
    FOR SELECT
    TO anon
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


-- 5. Helper: normalize_phone
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
    v_digits TEXT;
    v_result TEXT;
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
    -- 1. Security Check: verify logged-in user owns this shop
    SELECT stamps_required, default_country_code 
    INTO v_stamps_required, v_default_cc
    FROM public.shops
    WHERE id = p_shop_id AND owner_id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'unauthorized', 'message', 'You do not own this shop.');
    END IF;

    -- 2. Normalize the phone number
    v_norm_phone := public.normalize_phone(p_phone, COALESCE(v_default_cc, '+971'));
    IF v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('status', 'invalid_phone', 'message', 'Please check the phone number.');
    END IF;

    -- 3. Strict Active Customer Check: Customer MUST exist
    SELECT id, current_stamps, last_stamp_at
    INTO v_cust_id, v_current_stamps, v_last_stamp_at
    FROM public.customers
    WHERE shop_id = p_shop_id AND phone = v_norm_phone;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'status', 'not_active',
            'message', 'No active card found for this number. Customer must first request a stamp.'
        );
    END IF;

    -- 4. 60-minute Cooldown Rate Limit Check
    IF v_last_stamp_at IS NOT NULL THEN
        v_minutes_since_last := EXTRACT(EPOCH FROM (now() - v_last_stamp_at)) / 60.0;
        IF v_minutes_since_last < c_cooldown_minutes THEN
            v_minutes_left := CEIL(c_cooldown_minutes - v_minutes_since_last);
            RETURN jsonb_build_object(
                'status', 'too_soon',
                'minutes_left', v_minutes_left,
                'message', format('Already stamped recently. Next stamp available in %s minutes.', v_minutes_left)
            );
        END IF;
    END IF;

    -- 5. Calculate new stamps
    v_new_stamps := v_current_stamps + 1;

    -- Check if card reached full required stamps
    IF v_new_stamps >= v_stamps_required THEN
        UPDATE public.customers
        SET current_stamps = v_stamps_required,
            last_stamp_at = now()
        WHERE id = v_cust_id;

        INSERT INTO public.stamps (shop_id, customer_id, created_by)
        VALUES (p_shop_id, v_cust_id, auth.uid());

        RETURN jsonb_build_object(
            'status', 'card_full',
            'current_stamps', v_stamps_required,
            'stamps_required', v_stamps_required,
            'message', 'Reward Earned! Customer completed their card.'
        );
    END IF;

    -- Normal stamp addition
    UPDATE public.customers
    SET current_stamps = v_new_stamps,
        last_stamp_at = now()
    WHERE id = v_cust_id;

    INSERT INTO public.stamps (shop_id, customer_id, created_by)
    VALUES (p_shop_id, v_cust_id, auth.uid());

    RETURN jsonb_build_object(
        'status', 'ok',
        'current_stamps', v_new_stamps,
        'stamps_required', v_stamps_required,
        'message', format('Stamp added! Customer has %s of %s stamps.', v_new_stamps, v_stamps_required)
    );
END;
$$;


-- 7. get_card: Customer Stamp Balance with Name & Auto-Shop-Fallback
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
    v_norm_phone TEXT;
    v_stamps INT := 0;
    v_cust_id UUID;
    v_cust_name TEXT;
BEGIN
    -- 1. Find shop by slug
    SELECT id, name, stamps_required, reward_text, default_country_code
    INTO v_shop_id, v_shop_name, v_stamps_req, v_reward_text, v_default_cc
    FROM public.shops
    WHERE slug = lower(trim(p_shop_slug));

    -- Fallback: If slug not matched or was placeholder, link to primary shop
    IF NOT FOUND THEN
        SELECT id, name, stamps_required, reward_text, default_country_code
        INTO v_shop_id, v_shop_name, v_stamps_req, v_reward_text, v_default_cc
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
        'customer_name', COALESCE(v_cust_name, trim(p_name), '')
    );
END;
$$;

-- Overload for 2 arguments (backwards compatibility)
CREATE OR REPLACE FUNCTION public.get_card(
    p_shop_slug TEXT,
    p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.get_card(p_shop_slug, p_phone, NULL);
END;
$$;


-- 8. Customer Stamp Request Function (Public anonymous RPC)
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
    -- 1. Find shop by slug or fallback
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
        RETURN jsonb_build_object('status', 'invalid_phone', 'message', 'Invalid phone number format.');
    END IF;

    v_cust_name := NULLIF(trim(COALESCE(p_name, '')), '');

    -- 3. Ensure customer card exists/is active and update name
    INSERT INTO public.customers (shop_id, phone, current_stamps, rewards_given, name)
    VALUES (v_shop_id, v_norm_phone, 0, 0, v_cust_name)
    ON CONFLICT (shop_id, phone) DO UPDATE
    SET name = COALESCE(public.customers.name, EXCLUDED.name);

    -- 4. Check for recent pending request in last 10 minutes to prevent spam
    SELECT id INTO v_existing_id
    FROM public.stamp_requests
    WHERE shop_id = v_shop_id 
      AND phone = v_norm_phone 
      AND status = 'pending'
      AND created_at > now() - INTERVAL '10 minutes';

    IF FOUND THEN
        RETURN jsonb_build_object(
            'status', 'already_pending',
            'message', 'A stamp request is already pending. Please tell the cashier!'
        );
    END IF;

    -- 5. Create new pending stamp request with customer name
    INSERT INTO public.stamp_requests (shop_id, phone, status, customer_name)
    VALUES (v_shop_id, v_norm_phone, 'pending', v_cust_name)
    RETURNING id INTO v_request_id;

    RETURN jsonb_build_object(
        'status', 'ok',
        'request_id', v_request_id,
        'phone', v_norm_phone,
        'customer_name', v_cust_name,
        'message', 'Stamp requested! Please tell the cashier.'
    );
END;
$$;

-- Overload for 2 arguments
CREATE OR REPLACE FUNCTION public.request_stamp(
    p_shop_slug TEXT,
    p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.request_stamp(p_shop_slug, p_phone, NULL);
END;
$$;

-- Overload for swapped parameter order
CREATE OR REPLACE FUNCTION public.request_stamp(
    p_phone TEXT,
    p_shop_slug TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.request_stamp(p_shop_slug, p_phone, NULL);
END;
$$;


-- 9. Cashier Polls Pending Requests (includes customer_name)
CREATE OR REPLACE FUNCTION public.get_pending_stamp_requests(
    p_shop_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_owner BOOLEAN;
    v_requests JSONB;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.shops
        WHERE id = p_shop_id AND owner_id = auth.uid()
    ) INTO v_is_owner;

    IF NOT v_is_owner THEN
        RETURN jsonb_build_object('status', 'unauthorized', 'requests', '[]'::jsonb);
    END IF;

    -- Clean up stale pending requests older than 2 hours
    UPDATE public.stamp_requests
    SET status = 'cancelled'
    WHERE shop_id = p_shop_id AND status = 'pending' AND created_at < now() - INTERVAL '2 hours';

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', r.id,
                'phone', r.phone,
                'customer_name', COALESCE(r.customer_name, c.name, ''),
                'created_at', r.created_at,
                'status', r.status
            )
            ORDER BY r.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_requests
    FROM public.stamp_requests r
    LEFT JOIN public.customers c ON c.shop_id = r.shop_id AND c.phone = r.phone
    WHERE r.shop_id = p_shop_id AND r.status = 'pending';

    RETURN jsonb_build_object('status', 'ok', 'requests', v_requests);
END;
$$;


-- 10. Cashier Resolves (Accepts or Rejects) Request
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
    v_status TEXT;
    v_is_owner BOOLEAN;
    v_stamp_res JSONB;
BEGIN
    SELECT shop_id, phone, status
    INTO v_shop_id, v_phone, v_status
    FROM public.stamp_requests
    WHERE id = p_request_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'message', 'Request not found.');
    END IF;

    IF v_status <> 'pending' THEN
        RETURN jsonb_build_object('status', 'already_resolved', 'message', 'Request has already been processed.');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.shops
        WHERE id = v_shop_id AND owner_id = auth.uid()
    ) INTO v_is_owner;

    IF NOT v_is_owner THEN
        RETURN jsonb_build_object('status', 'unauthorized', 'message', 'Unauthorized.');
    END IF;

    IF p_action = 'accept' THEN
        v_stamp_res := public.add_stamp(v_shop_id, v_phone);

        IF (v_stamp_res->>'status') IN ('ok', 'card_full') THEN
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


-- 11. Customer Activity Log (Date-Wise for past 90 days / 3 months)
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


-- 12. Date-Wise Customer History Function (Individual customer)
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


-- 13. Get Default / Primary Shop
CREATE OR REPLACE FUNCTION public.get_default_shop()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_shop RECORD;
BEGIN
    SELECT slug, name, stamps_required, reward_text, default_country_code
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
        'default_country_code', v_shop.default_country_code
    );
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
