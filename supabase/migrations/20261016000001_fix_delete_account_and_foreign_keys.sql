-- ============================================================
-- Fix Delete Account RPC & Foreign Key Constraints
-- Ensures users can permanently delete their account without
-- foreign key violation blocks from stamps, rewards, or requests.
-- ============================================================

-- 1. Ensure foreign keys cascade or set null when user is deleted
DO $$
BEGIN
  -- stamps.created_by
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'stamps_created_by_fkey' AND table_name = 'stamps'
  ) THEN
    ALTER TABLE public.stamps DROP CONSTRAINT stamps_created_by_fkey;
  END IF;
  ALTER TABLE public.stamps 
    ADD CONSTRAINT stamps_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

  -- rewards.created_by
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'rewards_created_by_fkey' AND table_name = 'rewards'
  ) THEN
    ALTER TABLE public.rewards DROP CONSTRAINT rewards_created_by_fkey;
  END IF;
  ALTER TABLE public.rewards 
    ADD CONSTRAINT rewards_created_by_fkey 
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

  -- stamp_requests.resolved_by
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'stamp_requests_resolved_by_fkey' AND table_name = 'stamp_requests'
  ) THEN
    ALTER TABLE public.stamp_requests DROP CONSTRAINT stamp_requests_resolved_by_fkey;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stamp_requests'
  ) THEN
    ALTER TABLE public.stamp_requests 
      ADD CONSTRAINT stamp_requests_resolved_by_fkey 
      FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Robust delete_user_account RPC
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Step 1: Nullify any requests resolved by this user
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stamp_requests') THEN
    UPDATE public.stamp_requests SET resolved_by = NULL WHERE resolved_by = v_user_id;
    DELETE FROM public.stamp_requests WHERE shop_id IN (SELECT id FROM public.shops WHERE owner_id = v_user_id);
  END IF;

  -- Step 2: Delete stamps & rewards
  DELETE FROM public.stamps WHERE created_by = v_user_id OR shop_id IN (SELECT id FROM public.shops WHERE owner_id = v_user_id);
  DELETE FROM public.rewards WHERE created_by = v_user_id OR shop_id IN (SELECT id FROM public.shops WHERE owner_id = v_user_id);

  -- Step 3: Delete customers belonging to user's shops
  DELETE FROM public.customers WHERE shop_id IN (SELECT id FROM public.shops WHERE owner_id = v_user_id);

  -- Step 4: Delete user's shops
  DELETE FROM public.shops WHERE owner_id = v_user_id;

  -- Step 5: Delete user from auth.users
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;
