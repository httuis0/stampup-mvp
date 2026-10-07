-- ============================================================
-- Step 1: Create StampUp Tables
-- Description: Creates shops, customers, stamps, and rewards tables.
-- ============================================================

-- 1. SHOPS TABLE
-- Stores information about each shop/café registered by an owner.
CREATE TABLE IF NOT EXISTS public.shops (
    -- Unique identifier for each shop
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The owner's user ID from Supabase Auth
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Display name of the shop (e.g. "Chai Corner")
    name TEXT NOT NULL,
    -- Unique URL-friendly slug used in QR code link (e.g. "chai-corner-x7k2")
    slug TEXT NOT NULL UNIQUE,
    -- How many stamps are needed to earn a reward (between 3 and 20, default 8)
    stamps_required INT NOT NULL DEFAULT 8 CHECK (stamps_required >= 3 AND stamps_required <= 20),
    -- Text describing the customer's reward (e.g. "Free chai")
    reward_text TEXT NOT NULL,
    -- Timestamp when the shop was created
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for looking up shops quickly by slug (used by the customer web page)
CREATE INDEX IF NOT EXISTS idx_shops_slug ON public.shops(slug);
-- Index for looking up shops by owner
CREATE INDEX IF NOT EXISTS idx_shops_owner_id ON public.shops(owner_id);


-- 2. CUSTOMERS TABLE
-- Tracks each customer's stamp balance and rewards for a specific shop.
CREATE TABLE IF NOT EXISTS public.customers (
    -- Unique identifier for each customer record
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The shop this customer is visiting
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    -- Customer's normalized phone number (e.g. "+971501234567")
    phone TEXT NOT NULL,
    -- Number of active stamps collected toward the next reward
    current_stamps INT NOT NULL DEFAULT 0 CHECK (current_stamps >= 0),
    -- Total count of free rewards redeemed so far
    rewards_given INT NOT NULL DEFAULT 0 CHECK (rewards_given >= 0),
    -- Time when the customer last received a stamp (used for rate-limiting)
    last_stamp_at TIMESTAMPTZ,
    -- Timestamp when the customer was first registered
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Each phone number can only have ONE card per shop
    CONSTRAINT customers_shop_phone_unique UNIQUE (shop_id, phone)
);

-- Index for fast customer lookup by shop and phone
CREATE INDEX IF NOT EXISTS idx_customers_shop_phone ON public.customers(shop_id, phone);


-- 3. STAMPS TABLE (History Log)
-- Every time a stamp is added, an entry is recorded here.
CREATE TABLE IF NOT EXISTS public.stamps (
    -- Unique identifier for the stamp event
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The shop where the stamp was given
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    -- The customer who received the stamp
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    -- The logged-in user (owner or cashier) who gave the stamp
    created_by UUID NOT NULL REFERENCES auth.users(id),
    -- When the stamp was awarded
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for searching stamp history
CREATE INDEX IF NOT EXISTS idx_stamps_shop_customer ON public.stamps(shop_id, customer_id);


-- 4. REWARDS TABLE (History Log)
-- Every time a reward is redeemed, an entry is recorded here.
CREATE TABLE IF NOT EXISTS public.rewards (
    -- Unique identifier for the reward event
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The shop where the reward was redeemed
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    -- The customer who redeemed the reward
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    -- The logged-in user (owner or cashier) who gave the reward
    created_by UUID NOT NULL REFERENCES auth.users(id),
    -- When the reward was redeemed
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for searching reward redemption history
CREATE INDEX IF NOT EXISTS idx_rewards_shop_customer ON public.rewards(shop_id, customer_id);
