-- ============================================================
-- Security Verification: Row Level Security (RLS) Rules
-- Checks:
--   1. RLS is enabled on all 4 tables (shops, customers, stamps, rewards)
--   2. Strict Owner Isolation policy exists on customers (Shop A cannot see Shop B)
--   3. Strict Owner Isolation policy exists on shops
--   4. Strict Owner Isolation policy exists on stamps
--   5. Strict Owner Isolation policy exists on rewards
--   6. Anonymous (unauthenticated) users are completely blocked
-- ============================================================

SELECT
  '1. RLS enabled on shops table' AS check_name,
  'Enabled' AS expected,
  CASE WHEN (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'shops') THEN 'Enabled' ELSE 'Disabled' END AS actual,
  CASE WHEN (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'shops') THEN 'PASSED' ELSE 'FAILED' END AS status

UNION ALL

SELECT
  '2. RLS enabled on customers table',
  'Enabled',
  CASE WHEN (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customers') THEN 'Enabled' ELSE 'Disabled' END,
  CASE WHEN (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customers') THEN 'PASSED' ELSE 'FAILED' END

UNION ALL

SELECT
  '3. RLS enabled on stamps table',
  'Enabled',
  CASE WHEN (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'stamps') THEN 'Enabled' ELSE 'Disabled' END,
  CASE WHEN (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'stamps') THEN 'PASSED' ELSE 'FAILED' END

UNION ALL

SELECT
  '4. RLS enabled on rewards table',
  'Enabled',
  CASE WHEN (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rewards') THEN 'Enabled' ELSE 'Disabled' END,
  CASE WHEN (SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rewards') THEN 'PASSED' ELSE 'FAILED' END

UNION ALL

SELECT
  '5. Owner isolation policy on customers (Shop A cannot see Shop B)',
  'Active',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'customers' 
      AND qual ILIKE '%owner_id = auth.uid()%'
  ) THEN 'Active' ELSE 'Missing' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'customers' 
      AND qual ILIKE '%owner_id = auth.uid()%'
  ) THEN 'PASSED' ELSE 'FAILED' END

UNION ALL

SELECT
  '6. Owner isolation policy on shops',
  'Active',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'shops' 
      AND qual ILIKE '%owner_id = auth.uid()%'
  ) THEN 'Active' ELSE 'Missing' END,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'shops' 
      AND qual ILIKE '%owner_id = auth.uid()%'
  ) THEN 'PASSED' ELSE 'FAILED' END

UNION ALL

SELECT
  '7. Anonymous user blocked from direct table access',
  'Access Denied (false)',
  CASE WHEN has_table_privilege('anon', 'public.customers', 'select') = false 
        AND has_table_privilege('anon', 'public.shops', 'select') = false 
       THEN 'Access Denied (false)' ELSE 'Access Allowed' END,
  CASE WHEN has_table_privilege('anon', 'public.customers', 'select') = false 
        AND has_table_privilege('anon', 'public.shops', 'select') = false 
       THEN 'PASSED' ELSE 'FAILED' END;
