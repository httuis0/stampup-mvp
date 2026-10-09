-- Migration to add delete_user_account RPC
-- Allows a user to delete their own account and all associated data from the client application.

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- We delete from auth.users. 
  -- Thanks to ON DELETE CASCADE on public.shops (owner_id), all their shops, 
  -- customers, and stamp histories will be automatically removed.
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
