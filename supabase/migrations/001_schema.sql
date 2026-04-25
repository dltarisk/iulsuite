-- ============================================================
-- IUL Sales Portal — Database Schema
-- ============================================================

-- 1. Agents table
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'admin_agent', 'agent', 'ceo')),
  comp_rate NUMERIC(4,2) DEFAULT 0.50,
  monthly_goal INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  recruiter_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Deals table
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  state TEXT,
  phone TEXT,
  ap INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Issued', 'Issued Paid', 'Declined')),
  is_ny BOOLEAN DEFAULT false,
  date_submitted DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Deal notes table
CREATE TABLE deal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Team settings (singleton)
CREATE TABLE team_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  monthly_goal INTEGER NOT NULL DEFAULT 90000,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO team_settings (monthly_goal) VALUES (90000);

-- 5. Indexes
CREATE INDEX idx_deals_agent ON deals(agent_id);
CREATE INDEX idx_deals_status ON deals(status);
CREATE INDEX idx_deal_notes_deal ON deal_notes(deal_id);

-- ============================================================
-- Row Level Security
-- ============================================================

-- Agents
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents_read" ON agents FOR SELECT
  USING (true);

CREATE POLICY "agents_update" ON agents FOR UPDATE
  USING (
    (auth.jwt() ->> 'role') IN ('admin', 'admin_agent')
  );

CREATE POLICY "agents_insert" ON agents FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'role') IN ('admin', 'admin_agent')
  );

-- Deals
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deals_read" ON deals FOR SELECT
  USING (
    agent_id = (auth.jwt() ->> 'sub')::UUID
    OR (auth.jwt() ->> 'role') IN ('admin', 'admin_agent')
  );

CREATE POLICY "deals_insert" ON deals FOR INSERT
  WITH CHECK (
    agent_id = (auth.jwt() ->> 'sub')::UUID
  );

CREATE POLICY "deals_update" ON deals FOR UPDATE
  USING (
    agent_id = (auth.jwt() ->> 'sub')::UUID
    OR (auth.jwt() ->> 'role') IN ('admin', 'admin_agent')
  );

-- Deal notes
ALTER TABLE deal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_read" ON deal_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM deals
      WHERE deals.id = deal_notes.deal_id
      AND (
        deals.agent_id = (auth.jwt() ->> 'sub')::UUID
        OR (auth.jwt() ->> 'role') IN ('admin', 'admin_agent')
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
        OR (auth.jwt() ->> 'role') IN ('admin', 'admin_agent')
      )
    )
  );

-- Team settings
ALTER TABLE team_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_read" ON team_settings FOR SELECT USING (true);

CREATE POLICY "settings_update" ON team_settings FOR UPDATE
  USING ((auth.jwt() ->> 'role') IN ('admin', 'admin_agent'));
