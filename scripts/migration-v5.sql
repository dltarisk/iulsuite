-- Migration v5: Separate personal comp rate and override comp rate
-- Run in Supabase SQL Editor

-- ============================================================================
-- 1. Add override_rate to agents
--    NULL means "same as comp_rate" (backward-compatible default)
--    Backfill to comp_rate so existing behavior is unchanged
-- ============================================================================

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS override_rate NUMERIC(4,3);

-- Backfill: everyone starts with override_rate = comp_rate
UPDATE agents SET override_rate = comp_rate WHERE override_rate IS NULL;

-- ============================================================================
-- 2. Add override rate tracking to comp_rate_changes
--    NULL means that particular change didn't touch the override rate
-- ============================================================================

ALTER TABLE comp_rate_changes
  ADD COLUMN IF NOT EXISTS previous_override_rate NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS new_override_rate NUMERIC(4,3);
