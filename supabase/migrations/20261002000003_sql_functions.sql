-- ============================================================
-- Step 3: StampUp SQL Functions (RPC)
-- Description:
--   1. normalize_phone: Standardizes phone numbers to +971 format.
--   2. add_stamp: Adds a stamp with 60-min rate limit & full-card check.
--   3. give_reward: Resets stamps to 0 and increments rewards count.
--   4. get_card: Customer-facing function (Security Definer, returns stamp info only).
--   5. delete_customer: Deletes customer and cascaded history logs (GDPR/privacy).
--   6. undo_last_stamp: Reverts accidental stamp added within 60 seconds.
-- ============================================================


-- ------------------------------------------------------------
-- 1. HELPER: normalize_phone(phone, default_country_code)
-- ------------------------------------------------------------
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

    -- Remove spaces, dashes, parentheses, dots
    v_clean := regexp_replace(trim(p_phone), '[\s\-\(\)\.]', '', 'g');
    v_cc_digits := regexp_replace(p_default_country_code, '[^0-9]', '', 'g');

    -- Replace leading 00 with +
    IF v_clean LIKE '00%' THEN
        v_clean := '+' || substr(v_clean, 3);
    END IF;

    -- If starts with 0 (e.g. 0501234567), strip 0 and prepend country code (+971501234567)
    IF v_clean ~ '^0[0-9]' THEN
        v_result := p_default_country_code || substr(v_clean, 2);
    -- If already starts with +
    ELSIF v_clean LIKE '+%' THEN
        v_result := v_clean;
    -- If starts with country code digits without plus (e.g. 971501234567)
    ELSIF v_clean LIKE v_cc_digits || '%' THEN
        v_result := '+' || v_clean;
    -- Otherwise prepend country code
    ELSE
        v_result := p_default_country_code || v_clean;
    END IF;

    -- Basic length check: must have between 8 and 15 total digits
    v_digits := regexp_replace(v_result, '[^0-9]', '', 'g');
    IF length(v_digits) < 8 OR length(v_digits) > 15 THEN
        RETURN NULL;
    END IF;

    RETURN v_result;
END;
$$;


-- ------------------------------------------------------------
-- 2. add_stamp(shop_id, phone)
-- ------------------------------------------------------------
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
    -- Setting: minimum minutes before customer can receive another stamp
    c_cooldown_minutes CONSTANT INT := 60;

    v_stamps_required INT;
    v_norm_phone TEXT;
    v_cust_id UUID;
    v_current_stamps INT;
    v_last_stamp_at TIMESTAMPTZ;
    v_minutes_since_last NUMERIC;
    v_minutes_left INT;
    v_new_stamps INT;
BEGIN
    -- 1. Security Check: verify logged-in user owns this shop
    SELECT stamps_required INTO v_stamps_required
    FROM public.shops
    WHERE id = p_shop_id AND owner_id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'unauthorized', 'message', 'You do not own this shop.');
    END IF;

    -- 2. Normalize the phone number
    v_norm_phone := public.normalize_phone(p_phone);
    IF v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('status', 'invalid_phone', 'message', 'Please check the phone number.');
    END IF;

    -- 3. Find customer, or create if new
    SELECT id, current_stamps, last_stamp_at
    INTO v_cust_id, v_current_stamps, v_last_stamp_at
    FROM public.customers
    WHERE shop_id = p_shop_id AND phone = v_norm_phone;

    IF NOT FOUND THEN
        INSERT INTO public.customers (shop_id, phone, current_stamps, rewards_given)
        VALUES (p_shop_id, v_norm_phone, 0, 0)
        RETURNING id, current_stamps, last_stamp_at
        INTO v_cust_id, v_current_stamps, v_last_stamp_at;
    END IF;

    -- 4. Check if card is already full
    IF v_current_stamps >= v_stamps_required THEN
        RETURN jsonb_build_object(
            'status', 'card_full',
            'current_stamps', v_current_stamps,
            'stamps_required', v_stamps_required,
            'message', 'Card is full. Reward must be given first.'
        );
    END IF;

    -- 5. Rate-limit check: cooldown
    IF v_last_stamp_at IS NOT NULL THEN
        v_minutes_since_last := EXTRACT(EPOCH FROM (now() - v_last_stamp_at)) / 60;
        IF v_minutes_since_last < c_cooldown_minutes THEN
            v_minutes_left := CEIL(c_cooldown_minutes - v_minutes_since_last);
            RETURN jsonb_build_object(
                'status', 'too_soon',
                'minutes_left', v_minutes_left,
                'current_stamps', v_current_stamps,
                'stamps_required', v_stamps_required,
                'message', 'Customer received a stamp recently.'
            );
        END IF;
    END IF;

    -- 6. Add stamp and update customer record
    v_new_stamps := v_current_stamps + 1;
    UPDATE public.customers
    SET current_stamps = v_new_stamps,
        last_stamp_at = now()
    WHERE id = v_cust_id;

    -- Insert into stamp history log
    INSERT INTO public.stamps (shop_id, customer_id, created_by)
    VALUES (p_shop_id, v_cust_id, auth.uid());

    RETURN jsonb_build_object(
        'status', 'ok',
        'current_stamps', v_new_stamps,
        'stamps_required', v_stamps_required
    );
END;
$$;


-- ------------------------------------------------------------
-- 3. give_reward(shop_id, phone)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.give_reward(
    p_shop_id UUID,
    p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_stamps_required INT;
    v_norm_phone TEXT;
    v_cust_id UUID;
    v_current_stamps INT;
    v_rewards_given INT;
BEGIN
    -- 1. Security check: verify owner
    SELECT stamps_required INTO v_stamps_required
    FROM public.shops
    WHERE id = p_shop_id AND owner_id = auth.uid();

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'unauthorized', 'message', 'You do not own this shop.');
    END IF;

    -- 2. Normalize phone
    v_norm_phone := public.normalize_phone(p_phone);
    IF v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('status', 'invalid_phone', 'message', 'Please check the phone number.');
    END IF;

    -- 3. Find customer
    SELECT id, current_stamps, rewards_given
    INTO v_cust_id, v_current_stamps, v_rewards_given
    FROM public.customers
    WHERE shop_id = p_shop_id AND phone = v_norm_phone;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'customer_not_found', 'message', 'Customer not found.');
    END IF;

    -- 4. Check if card has enough stamps
    IF v_current_stamps < v_stamps_required THEN
        RETURN jsonb_build_object(
            'status', 'not_ready',
            'current_stamps', v_current_stamps,
            'stamps_required', v_stamps_required,
            'message', 'Not enough stamps to claim reward.'
        );
    END IF;

    -- 5. Reset stamps to 0 and increment rewards_given
    UPDATE public.customers
    SET current_stamps = 0,
        rewards_given = v_rewards_given + 1
    WHERE id = v_cust_id;

    -- Insert into reward history log
    INSERT INTO public.rewards (shop_id, customer_id, created_by)
    VALUES (p_shop_id, v_cust_id, auth.uid());

    RETURN jsonb_build_object(
        'status', 'ok',
        'current_stamps', 0,
        'stamps_required', v_stamps_required,
        'rewards_given', v_rewards_given + 1
    );
END;
$$;


-- ------------------------------------------------------------
-- 4. get_card(shop_slug, phone) [FOR THE CUSTOMER PAGE]
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_card(
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
    v_stamps_req INT;
    v_reward_text TEXT;
    v_norm_phone TEXT;
    v_stamps INT := 0;
BEGIN
    -- 1. Find shop by slug
    SELECT id, name, stamps_required, reward_text
    INTO v_shop_id, v_shop_name, v_stamps_req, v_reward_text
    FROM public.shops
    WHERE slug = lower(trim(p_shop_slug));

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'shop_not_found', 'message', 'Shop not found.');
    END IF;

    -- 2. Normalize customer phone
    v_norm_phone := public.normalize_phone(p_phone);
    IF v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('status', 'invalid_phone', 'message', 'Please check the phone number.');
    END IF;

    -- 3. Lookup customer stamps for this shop
    SELECT current_stamps INTO v_stamps
    FROM public.customers
    WHERE shop_id = v_shop_id AND phone = v_norm_phone;

    -- If customer has never visited, show 0 stamps (do not say "not found")
    IF v_stamps IS NULL THEN
        v_stamps := 0;
    END IF;

    -- Return ONLY public card data (never return other customers or phone numbers!)
    RETURN jsonb_build_object(
        'status', 'ok',
        'shop_name', v_shop_name,
        'reward_text', v_reward_text,
        'stamps_required', v_stamps_req,
        'current_stamps', v_stamps
    );
END;
$$;

-- Allow anonymous users to call get_card
GRANT EXECUTE ON FUNCTION public.get_card(TEXT, TEXT) TO anon, authenticated;


-- ------------------------------------------------------------
-- 5. delete_customer(shop_id, phone) [OWNER ONLY]
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_customer(
    p_shop_id UUID,
    p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_norm_phone TEXT;
    v_deleted_count INT;
BEGIN
    -- 1. Security Check: verify owner
    IF NOT EXISTS (
        SELECT 1 FROM public.shops
        WHERE id = p_shop_id AND owner_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object('status', 'unauthorized', 'message', 'You do not own this shop.');
    END IF;

    -- 2. Normalize phone
    v_norm_phone := public.normalize_phone(p_phone);
    IF v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('status', 'invalid_phone', 'message', 'Please check the phone number.');
    END IF;

    -- 3. Delete customer (foreign key CASCADE automatically removes stamps and rewards logs)
    DELETE FROM public.customers
    WHERE shop_id = p_shop_id AND phone = v_norm_phone;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count = 0 THEN
        RETURN jsonb_build_object('status', 'not_found', 'message', 'Customer not found.');
    END IF;

    RETURN jsonb_build_object('status', 'ok', 'message', 'Customer data and history deleted.');
END;
$$;


-- ------------------------------------------------------------
-- 6. undo_last_stamp(shop_id, phone) [FOR CASHIER MISTAKES]
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_last_stamp(
    p_shop_id UUID,
    p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_norm_phone TEXT;
    v_cust_id UUID;
    v_current_stamps INT;
    v_latest_stamp_id UUID;
    v_latest_stamp_time TIMESTAMPTZ;
BEGIN
    -- 1. Security Check: verify owner
    IF NOT EXISTS (
        SELECT 1 FROM public.shops
        WHERE id = p_shop_id AND owner_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object('status', 'unauthorized', 'message', 'You do not own this shop.');
    END IF;

    -- 2. Normalize phone
    v_norm_phone := public.normalize_phone(p_phone);
    IF v_norm_phone IS NULL THEN
        RETURN jsonb_build_object('status', 'invalid_phone', 'message', 'Please check the phone number.');
    END IF;

    -- 3. Find customer
    SELECT id, current_stamps
    INTO v_cust_id, v_current_stamps
    FROM public.customers
    WHERE shop_id = p_shop_id AND phone = v_norm_phone;

    IF NOT FOUND OR v_current_stamps <= 0 THEN
        RETURN jsonb_build_object('status', 'no_stamps', 'message', 'No stamps to undo.');
    END IF;

    -- 4. Find most recent stamp
    SELECT id, created_at
    INTO v_latest_stamp_id, v_latest_stamp_time
    FROM public.stamps
    WHERE shop_id = p_shop_id AND customer_id = v_cust_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'no_stamps', 'message', 'No stamp history found.');
    END IF;

    -- Delete latest stamp log
    DELETE FROM public.stamps WHERE id = v_latest_stamp_id;

    -- Decrement customer stamp count
    UPDATE public.customers
    SET current_stamps = v_current_stamps - 1
    WHERE id = v_cust_id;

    RETURN jsonb_build_object(
        'status', 'ok',
        'current_stamps', v_current_stamps - 1,
        'message', 'Last stamp was undone.'
    );
END;
$$;
