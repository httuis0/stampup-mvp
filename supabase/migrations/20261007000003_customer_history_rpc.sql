-- ============================================================
-- Step 6: Customer Date-Wise Activity History RPC
-- Allows authorized managers to view full chronological stamp & reward history
-- ============================================================

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
    -- 1. Verify that logged-in user owns this shop
    IF NOT EXISTS (
        SELECT 1 FROM public.shops 
        WHERE id = p_shop_id AND owner_id = auth.uid()
    ) THEN
        RETURN jsonb_build_object('status', 'unauthorized', 'message', 'Unauthorized', 'events', '[]'::jsonb);
    END IF;

    -- 2. Fetch all stamp and reward events ordered chronologically
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

