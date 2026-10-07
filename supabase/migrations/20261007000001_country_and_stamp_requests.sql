-- ============================================================
-- Step 4: Multi-Country Support & Customer Stamp Requests
-- ============================================================

-- 1. Add default_country_code to shops
ALTER TABLE public.shops 
ADD COLUMN IF NOT EXISTS default_country_code TEXT NOT NULL DEFAULT '+971';

-- 2. Create stamp_requests table
CREATE TABLE IF NOT EXISTS public.stamp_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_stamp_requests_shop_status ON public.stamp_requests(shop_id, status, created_at DESC);

-- Enable RLS on stamp_requests
ALTER TABLE public.stamp_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Shop owners can view and update their own shop's stamp requests
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


-- 3. RPC: request_stamp(p_shop_slug, p_phone)
-- Customer calls this anonymously from web to request a stamp at the counter.
CREATE OR REPLACE FUNCTION public.request_stamp(
    p_shop_slug TEXT,
    p_phone TEXT
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
BEGIN
    -- 1. Find shop by slug
    SELECT id, name, default_country_code 
    INTO v_shop_id, v_shop_name, v_default_cc
    FROM public.shops
    WHERE slug = trim(p_shop_slug);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'shop_not_found', 'message', 'Shop was not found.');
    END IF;

    -- 2. Normalize phone number
    v_norm_phone := public.normalize_phone(p_phone, COALESCE(v_default_cc, '+971'));
    IF v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('status', 'invalid_phone', 'message', 'Invalid phone number format.');
    END IF;

    -- 3. Check for recent pending request in last 10 minutes to prevent spam
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

    -- 4. Create new pending stamp request
    INSERT INTO public.stamp_requests (shop_id, phone, status)
    VALUES (v_shop_id, v_norm_phone, 'pending')
    RETURNING id INTO v_request_id;

    RETURN jsonb_build_object(
        'status', 'ok',
        'request_id', v_request_id,
        'phone', v_norm_phone,
        'message', 'Stamp requested! Please tell the cashier.'
    );
END;
$$;


-- 4. RPC: get_pending_stamp_requests(p_shop_id)
-- Cashier queries this to see live incoming requests
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
    -- Verify shop owner
    SELECT EXISTS (
        SELECT 1 FROM public.shops
        WHERE id = p_shop_id AND owner_id = auth.uid()
    ) INTO v_is_owner;

    IF NOT v_is_owner THEN
        RETURN jsonb_build_object('status', 'unauthorized', 'requests', '[]'::jsonb);
    END IF;

    -- Auto-expire requests older than 2 hours to keep clean
    UPDATE public.stamp_requests
    SET status = 'cancelled'
    WHERE shop_id = p_shop_id AND status = 'pending' AND created_at < now() - INTERVAL '2 hours';

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', r.id,
                'phone', r.phone,
                'created_at', r.created_at,
                'status', r.status
            )
            ORDER BY r.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_requests
    FROM public.stamp_requests r
    WHERE r.shop_id = p_shop_id AND r.status = 'pending';

    RETURN jsonb_build_object('status', 'ok', 'requests', v_requests);
END;
$$;


-- 5. RPC: resolve_stamp_request(p_request_id, p_action)
-- Cashier accepts (+1 stamp) or rejects request
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
    v_add_stamp_res JSONB;
BEGIN
    -- 1. Fetch request details
    SELECT r.shop_id, r.phone, r.status
    INTO v_shop_id, v_phone, v_status
    FROM public.stamp_requests r
    WHERE r.id = p_request_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'not_found', 'message', 'Request not found.');
    END IF;

    IF v_status != 'pending' THEN
        RETURN jsonb_build_object('status', 'already_resolved', 'message', 'This request was already resolved.');
    END IF;

    -- 2. Verify logged-in owner
    SELECT EXISTS (
        SELECT 1 FROM public.shops
        WHERE id = v_shop_id AND owner_id = auth.uid()
    ) INTO v_is_owner;

    IF NOT v_is_owner THEN
        RETURN jsonb_build_object('status', 'unauthorized', 'message', 'You do not own this shop.');
    END IF;

    -- 3. Handle Action
    IF lower(p_action) = 'accept' THEN
        -- Add stamp
        v_add_stamp_res := public.add_stamp(v_shop_id, v_phone);

        -- Mark accepted
        UPDATE public.stamp_requests
        SET status = 'accepted', resolved_at = now(), resolved_by = auth.uid()
        WHERE id = p_request_id;

        RETURN jsonb_build_object(
            'status', 'ok',
            'action', 'accepted',
            'phone', v_phone,
            'stamp_result', v_add_stamp_res
        );
    ELSIF lower(p_action) = 'reject' THEN
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
