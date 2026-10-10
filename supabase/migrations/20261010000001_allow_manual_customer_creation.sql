-- ============================================================
-- Revert Strict Active Customer Check
-- Allows cashiers to manually add a stamp to a new phone number
-- without requiring the customer to scan the QR code first.
-- ============================================================

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

        INSERT INTO public.stamps (customer_id, shop_id, created_by)
        VALUES (v_cust_id, p_shop_id, auth.uid());

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

    INSERT INTO public.stamps (customer_id, shop_id, created_by)
    VALUES (v_cust_id, p_shop_id, auth.uid());

    RETURN jsonb_build_object(
        'status', 'ok',
        'current_stamps', v_new_stamps,
        'stamps_required', v_stamps_required,
        'message', format('Stamp added! Customer has %s of %s stamps.', v_new_stamps, v_stamps_required)
    );
END;
$$;
