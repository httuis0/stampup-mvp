-- ============================================================
-- Migration: WhatsApp Outbox Queue & Background Dispatch
-- Enables background automated WhatsApp message dispatching
-- without landing or switching the cashier to WhatsApp on-device.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE,
  recipient_phone TEXT NOT NULL,
  message_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'sent', 'failed'
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

-- Index for background workers / webhooks
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_status ON public.whatsapp_outbox(status, created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_shop ON public.whatsapp_outbox(shop_id);

-- Enable Row Level Security
ALTER TABLE public.whatsapp_outbox ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users and service roles to view and insert
DROP POLICY IF EXISTS "Shops can view their whatsapp outbox" ON public.whatsapp_outbox;
CREATE POLICY "Shops can view their whatsapp outbox"
  ON public.whatsapp_outbox FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Shops can insert into whatsapp outbox" ON public.whatsapp_outbox;
CREATE POLICY "Shops can insert into whatsapp outbox"
  ON public.whatsapp_outbox FOR INSERT
  WITH CHECK (true);

-- RPC Function for client app to dispatch WhatsApp message in background
CREATE OR REPLACE FUNCTION public.dispatch_whatsapp_message(
  p_shop_id UUID,
  p_phone TEXT,
  p_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_phone IS NULL OR trim(p_phone) = '' THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Phone number is required');
  END IF;

  INSERT INTO public.whatsapp_outbox (
    shop_id,
    recipient_phone,
    message_text,
    status,
    created_at
  )
  VALUES (
    p_shop_id,
    trim(p_phone),
    trim(p_text),
    'queued',
    now()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'outbox_id', v_id,
    'message', 'WhatsApp notification queued for background delivery'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_whatsapp_message(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
