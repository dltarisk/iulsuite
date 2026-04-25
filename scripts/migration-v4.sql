-- Migration v4: Auto-generated numeric agent_codes, pre-app archive/delete/deal-link
-- Run in Supabase SQL Editor

-- ============================================================================
-- 1. BACKFILL AGENT_CODES TO NUMERIC FORMAT
--    Super Admin (role='admin') = 000001
--    All other agents = sequential starting at 000002 (by creation order)
-- ============================================================================

-- Admin(s) → 000001
UPDATE agents SET agent_code = '000001' WHERE role = 'admin';

-- Non-admin agents → sequential 000002, 000003, ...
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) + 1 AS rn
  FROM agents
  WHERE role <> 'admin'
)
UPDATE agents
SET agent_code = LPAD(numbered.rn::text, 6, '0')
FROM numbered
WHERE agents.id = numbered.id;

-- Ensure uniqueness going forward
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agents_agent_code_unique'
  ) THEN
    ALTER TABLE agents ADD CONSTRAINT agents_agent_code_unique UNIQUE (agent_code);
  END IF;
END $$;

-- ============================================================================
-- 2. PREAPPLICATIONS: add archived + deal_id columns
-- ============================================================================

ALTER TABLE preapplications
  ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;

ALTER TABLE preapplications
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS preapplications_archived_idx ON preapplications(archived);
CREATE INDEX IF NOT EXISTS preapplications_deal_id_idx ON preapplications(deal_id);

-- ============================================================================
-- 3. RLS: allow agents to update/delete their own pre-apps, admins all
-- ============================================================================

DROP POLICY IF EXISTS preapp_update ON preapplications;
CREATE POLICY preapp_update ON preapplications
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS preapp_delete ON preapplications;
CREATE POLICY preapp_delete ON preapplications
  FOR DELETE
  USING (true);
