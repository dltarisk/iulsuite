-- ============================================================
-- MIGRATION V3 — Run in Supabase SQL Editor
-- Adds: agent_code, email on agents, preapplications table
-- ============================================================

-- 1. Add agent_code and email to agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS agent_code TEXT UNIQUE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Create preapplications table
CREATE TABLE IF NOT EXISTS preapplications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  agent_code TEXT,
  form_data JSONB NOT NULL,
  client_name TEXT,
  client_phone TEXT,
  client_email TEXT,
  plan TEXT,
  monthly_premium NUMERIC(10,2),
  status TEXT DEFAULT 'New' CHECK (status IN ('New', 'Reviewed', 'Converted', 'Archived')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preapp_agent ON preapplications(agent_id);

-- 3. RLS for preapplications
ALTER TABLE preapplications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "preapp_read" ON preapplications;
CREATE POLICY "preapp_read" ON preapplications FOR SELECT
  USING (
    agent_id = (auth.jwt() ->> 'sub')::UUID
    OR (auth.jwt() ->> 'user_role') IN ('admin', 'admin_agent')
  );

-- Allow anonymous/public inserts from the pre-app form
DROP POLICY IF EXISTS "preapp_insert" ON preapplications;
CREATE POLICY "preapp_insert" ON preapplications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "preapp_update" ON preapplications;
CREATE POLICY "preapp_update" ON preapplications FOR UPDATE
  USING (
    agent_id = (auth.jwt() ->> 'sub')::UUID
    OR (auth.jwt() ->> 'user_role') IN ('admin', 'admin_agent')
  );
