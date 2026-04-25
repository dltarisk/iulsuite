-- ============================================================
-- COMPLETE DATABASE SETUP — Run in Supabase SQL Editor
-- ============================================================
-- This file combines schema + seed data.
-- Run this once in the Supabase Dashboard > SQL Editor.

-- ============================================================
-- 1. SCHEMA
-- ============================================================

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'admin_agent', 'agent', 'ceo')),
  comp_rate NUMERIC(4,2) DEFAULT 0.50,
  monthly_goal INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  recruiter_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  agent_code TEXT UNIQUE,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  state TEXT,
  phone TEXT,
  ap INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Issued', 'Issued Paid', 'Declined')),
  is_ny BOOLEAN DEFAULT false,
  date_submitted DATE DEFAULT CURRENT_DATE,
  date_issued_paid DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  monthly_goal INTEGER NOT NULL DEFAULT 90000,
  goal_month TEXT DEFAULT to_char(now(), 'YYYY-MM'),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO team_settings (monthly_goal) VALUES (90000) ON CONFLICT (id) DO NOTHING;

-- Pre-applications submitted via public form
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

-- Commission rate change history
CREATE TABLE IF NOT EXISTS comp_rate_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  previous_rate NUMERIC(4,2) NOT NULL,
  new_rate NUMERIC(4,2) NOT NULL,
  effective_date DATE NOT NULL,
  changed_by UUID REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deals_agent ON deals(agent_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deal_notes_deal ON deal_notes(deal_id);
CREATE INDEX IF NOT EXISTS idx_comp_rate_changes_agent ON comp_rate_changes(agent_id);

-- ============================================================
-- 2. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE preapplications ENABLE ROW LEVEL SECURITY;
ALTER TABLE comp_rate_changes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "agents_read" ON agents;
DROP POLICY IF EXISTS "agents_update" ON agents;
DROP POLICY IF EXISTS "agents_insert" ON agents;
DROP POLICY IF EXISTS "deals_read" ON deals;
DROP POLICY IF EXISTS "deals_insert" ON deals;
DROP POLICY IF EXISTS "deals_update" ON deals;
DROP POLICY IF EXISTS "notes_read" ON deal_notes;
DROP POLICY IF EXISTS "notes_insert" ON deal_notes;
DROP POLICY IF EXISTS "settings_read" ON team_settings;
DROP POLICY IF EXISTS "settings_update" ON team_settings;

-- Agents
CREATE POLICY "agents_read" ON agents FOR SELECT USING (true);
CREATE POLICY "agents_update" ON agents FOR UPDATE
  USING ((auth.jwt() ->> 'user_role') IN ('admin', 'admin_agent'));
CREATE POLICY "agents_insert" ON agents FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'user_role') IN ('admin', 'admin_agent'));

-- Deals
CREATE POLICY "deals_read" ON deals FOR SELECT USING (true);
CREATE POLICY "deals_insert" ON deals FOR INSERT
  WITH CHECK (agent_id = (auth.jwt() ->> 'sub')::UUID);
CREATE POLICY "deals_update" ON deals FOR UPDATE
  USING (
    agent_id = (auth.jwt() ->> 'sub')::UUID
    OR (auth.jwt() ->> 'user_role') IN ('admin', 'admin_agent')
  );
CREATE POLICY "deals_delete" ON deals FOR DELETE
  USING (
    agent_id = (auth.jwt() ->> 'sub')::UUID
    OR (auth.jwt() ->> 'user_role') IN ('admin', 'admin_agent')
  );

-- Deal notes
CREATE POLICY "notes_read" ON deal_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM deals
      WHERE deals.id = deal_notes.deal_id
      AND (
        deals.agent_id = (auth.jwt() ->> 'sub')::UUID
        OR (auth.jwt() ->> 'user_role') IN ('admin', 'admin_agent')
      )
    )
  );
CREATE POLICY "notes_insert" ON deal_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM deals
      WHERE deals.id = deal_notes.deal_id
      AND (
        deals.agent_id = (auth.jwt() ->> 'sub')::UUID
        OR (auth.jwt() ->> 'user_role') IN ('admin', 'admin_agent')
      )
    )
  );

-- Team settings
CREATE POLICY "settings_read" ON team_settings FOR SELECT USING (true);
CREATE POLICY "settings_update" ON team_settings FOR UPDATE
  USING ((auth.jwt() ->> 'user_role') IN ('admin', 'admin_agent'));

-- Preapplications
DROP POLICY IF EXISTS "preapp_read" ON preapplications;
DROP POLICY IF EXISTS "preapp_insert" ON preapplications;
DROP POLICY IF EXISTS "preapp_update" ON preapplications;
CREATE POLICY "preapp_read" ON preapplications FOR SELECT
  USING (
    agent_id = (auth.jwt() ->> 'sub')::UUID
    OR (auth.jwt() ->> 'user_role') IN ('admin', 'admin_agent')
  );
-- Allow anonymous inserts (from public pre-app form)
CREATE POLICY "preapp_insert" ON preapplications FOR INSERT WITH CHECK (true);
CREATE POLICY "preapp_update" ON preapplications FOR UPDATE
  USING (
    agent_id = (auth.jwt() ->> 'sub')::UUID
    OR (auth.jwt() ->> 'user_role') IN ('admin', 'admin_agent')
  );

-- Comp rate changes
DROP POLICY IF EXISTS "comp_rate_changes_read" ON comp_rate_changes;
DROP POLICY IF EXISTS "comp_rate_changes_insert" ON comp_rate_changes;
CREATE POLICY "comp_rate_changes_read" ON comp_rate_changes FOR SELECT USING (true);
CREATE POLICY "comp_rate_changes_insert" ON comp_rate_changes FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'user_role') IN ('admin', 'admin_agent'));

-- ============================================================
-- 3. SEED DATA
-- ============================================================
-- bcrypt hashes (cost 10):
--   PIN 7740 → $2b$10$6Qzb/QmVIHCJy2Q08e99A.Oz.owwRWX0Jers8q7QXy9h7d2fWprEm
--   PIN 1923 → $2b$10$HPnAlOPgBYI6vTVOKO6Z5eQBaBZkoYN.fSc63WZclGYxXqW/mcJMa
--   PIN 1234 → $2b$10$87wz5j8rMiji0/9zxGUzEeuijzvef4fkTUsi0zCywRhihx3QQyhxi

-- Sandra Hernandez (admin_agent)
INSERT INTO agents (id, name, pin_hash, role, comp_rate, monthly_goal, active)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'Sandra Hernandez',
  '$2b$10$HPnAlOPgBYI6vTVOKO6Z5eQBaBZkoYN.fSc63WZclGYxXqW/mcJMa',
  'admin_agent', 0.80, 50000, true
) ON CONFLICT (id) DO NOTHING;

-- Admin
INSERT INTO agents (id, name, pin_hash, role, comp_rate, monthly_goal, active)
VALUES (
  'a1000000-0000-0000-0000-000000000000',
  'Admin',
  '$2b$10$6Qzb/QmVIHCJy2Q08e99A.Oz.owwRWX0Jers8q7QXy9h7d2fWprEm',
  'admin', 0.00, 0, false
) ON CONFLICT (id) DO NOTHING;

-- NOTE: Additional agents (Valentina, Karelin, etc.) are created via
-- the Admin panel at runtime. No seed agents beyond Sandra + Admin.

-- Sample deals for Sandra
INSERT INTO deals (agent_id, client_name, state, phone, ap, status, is_ny, date_submitted)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Maria Garcia', 'FL', '(305) 555-0101', 3600, 'Issued Paid', false, '2026-03-02'),
  ('a1000000-0000-0000-0000-000000000001', 'Carlos Mendez', 'FL', '(786) 555-0202', 2400, 'Issued', false, '2026-03-05'),
  ('a1000000-0000-0000-0000-000000000001', 'Rosa Jimenez', 'TX', '(713) 555-0303', 1800, 'Submitted', false, '2026-03-15');

-- Sample deal notes for Sandra's deals
INSERT INTO deal_notes (deal_id, author_id, content)
SELECT d.id, d.agent_id, 'Client very interested in IUL for retirement'
FROM deals d WHERE d.client_name = 'Maria Garcia' LIMIT 1;

INSERT INTO deal_notes (deal_id, author_id, content)
SELECT d.id, d.agent_id, 'Underwriting approved — clean health history'
FROM deals d WHERE d.client_name = 'Maria Garcia' LIMIT 1;

INSERT INTO deal_notes (deal_id, author_id, content)
SELECT d.id, d.agent_id, 'Waiting on medical records from PCP'
FROM deals d WHERE d.client_name = 'Rosa Jimenez' LIMIT 1;
