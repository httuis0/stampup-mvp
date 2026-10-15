-- ============================================================
-- Migration: Auto Confirm Emails & Check Email Exists RPC
-- Ensures users can log in immediately upon signup and provides
-- accurate "Email not registered" vs "Wrong password" feedback.
-- ============================================================

-- 1. Function to check if an email already has an account
CREATE OR REPLACE FUNCTION public.check_email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  IF p_email IS NULL OR trim(p_email) = '' THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE lower(email) = lower(trim(p_email))
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO anon, authenticated, service_role;

-- 2. Trigger function to auto-confirm new signups immediately
CREATE OR REPLACE FUNCTION public.auto_confirm_user_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_auto_confirm_user_email ON auth.users;
CREATE TRIGGER tr_auto_confirm_user_email
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_confirm_user_email();

-- 3. Confirm any existing unconfirmed users
UPDATE auth.users
SET email_confirmed_at = now()
WHERE email_confirmed_at IS NULL;
