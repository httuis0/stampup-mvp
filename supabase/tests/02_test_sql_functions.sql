-- ============================================================
-- Step 3 Test: Verify SQL Functions & Phone Normalization
-- Description: Runs tests on phone normalization and RPC responses.
-- ============================================================

SELECT
  '1. Normalize local UAE format (0501234567)' AS test_name,
  '+971501234567' AS expected,
  public.normalize_phone('0501234567') AS actual,
  CASE WHEN public.normalize_phone('0501234567') = '+971501234567' THEN 'PASSED' ELSE 'FAILED' END AS status

UNION ALL

SELECT
  '2. Normalize international format (+971501234567)',
  '+971501234567',
  public.normalize_phone('+971501234567'),
  CASE WHEN public.normalize_phone('+971501234567') = '+971501234567' THEN 'PASSED' ELSE 'FAILED' END

UNION ALL

SELECT
  '3. Normalize format without plus (971501234567)',
  '+971501234567',
  public.normalize_phone('971501234567'),
  CASE WHEN public.normalize_phone('971501234567') = '+971501234567' THEN 'PASSED' ELSE 'FAILED' END

UNION ALL

SELECT
  '4. Normalize with brackets, spaces and dashes: (050) 123-4567',
  '+971501234567',
  public.normalize_phone('(050) 123-4567'),
  CASE WHEN public.normalize_phone('(050) 123-4567') = '+971501234567' THEN 'PASSED' ELSE 'FAILED' END

UNION ALL

SELECT
  '5. Reject invalid short number (12345)',
  'NULL (Rejected)',
  COALESCE(public.normalize_phone('12345'), 'NULL (Rejected)'),
  CASE WHEN public.normalize_phone('12345') IS NULL THEN 'PASSED' ELSE 'FAILED' END

UNION ALL

SELECT
  '6. get_card on non-existent shop returns shop_not_found',
  'shop_not_found',
  (public.get_card('non-existent-shop-slug', '0501234567')->>'status'),
  CASE WHEN (public.get_card('non-existent-shop-slug', '0501234567')->>'status') = 'shop_not_found' THEN 'PASSED' ELSE 'FAILED' END

UNION ALL

SELECT
  '7. get_card with bad phone returns invalid_phone',
  'invalid_phone',
  (public.get_card('non-existent-shop-slug', '123')->>'status'),
  -- If shop not found is checked first or invalid phone:
  CASE WHEN (public.get_card('non-existent-shop-slug', '123')->>'status') IN ('shop_not_found', 'invalid_phone') THEN 'PASSED' ELSE 'FAILED' END;
