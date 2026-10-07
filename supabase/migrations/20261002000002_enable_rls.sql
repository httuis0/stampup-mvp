-- ============================================================
-- Step 2: Enable Row Level Security (RLS) & Policies
-- Description: Ensures shop owners can ONLY view and manage their
-- own shop's data. Anonymous users have ZERO direct table access.
-- ============================================================

-- 1. ENABLE ROW LEVEL SECURITY (RLS) ON ALL 4 TABLES
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;

-- 2. REVOKE DIRECT ACCESS FROM ANONYMOUS USERS
-- Customer page will only read via a dedicated security definer function.
REVOKE ALL ON TABLE public.shops FROM anon;
REVOKE ALL ON TABLE public.customers FROM anon;
REVOKE ALL ON TABLE public.stamps FROM anon;
REVOKE ALL ON TABLE public.rewards FROM anon;

-- 3. RLS POLICIES FOR SHOPS
-- Shop owner can only view, insert, update, and delete their own shop.
DROP POLICY IF EXISTS "Owner can manage own shop" ON public.shops;
CREATE POLICY "Owner can manage own shop"
ON public.shops
FOR ALL
TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());


-- 4. RLS POLICIES FOR CUSTOMERS
-- Shop owner can only view, insert, update, and delete customers for their own shop.
DROP POLICY IF EXISTS "Owner can manage own customers" ON public.customers;
CREATE POLICY "Owner can manage own customers"
ON public.customers
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.shops
        WHERE shops.id = customers.shop_id
          AND shops.owner_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.shops
        WHERE shops.id = customers.shop_id
          AND shops.owner_id = auth.uid()
    )
);


-- 5. RLS POLICIES FOR STAMPS (History Log)
-- Shop owner can only view and manage stamp records for their own shop.
DROP POLICY IF EXISTS "Owner can manage own stamps" ON public.stamps;
CREATE POLICY "Owner can manage own stamps"
ON public.stamps
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.shops
        WHERE shops.id = stamps.shop_id
          AND shops.owner_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.shops
        WHERE shops.id = stamps.shop_id
          AND shops.owner_id = auth.uid()
    )
);


-- 6. RLS POLICIES FOR REWARDS (History Log)
-- Shop owner can only view and manage reward records for their own shop.
DROP POLICY IF EXISTS "Owner can manage own rewards" ON public.rewards;
CREATE POLICY "Owner can manage own rewards"
ON public.rewards
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.shops
        WHERE shops.id = rewards.shop_id
          AND shops.owner_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.shops
        WHERE shops.id = rewards.shop_id
          AND shops.owner_id = auth.uid()
    )
);
