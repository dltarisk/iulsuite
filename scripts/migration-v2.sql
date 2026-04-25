-- ============================================================
-- MIGRATION V2 — Run in Supabase SQL Editor
-- Adds: date_issued_paid, comp_rate_changes table, RLS updates
-- ============================================================

-- 1. Add date_issued_paid column to deals
ALTER TABLE deals ADD COLUMN IF NOT EXISTS date_issued_paid DATE;

-- 2. Create comp_rate_changes table
CREATE TABLE IF NOT EXISTS comp_rate_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  previous_rate NUMERIC(4,2) NOT NULL,
  new_rate NUMERIC(4,2) NOT NULL,
  effective_date DATE NOT NULL,
  changed_by UUID REFERENCES agents(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comp_rate_changes_agent ON comp_rate_changes(agent_id);

-- 3. RLS for comp_rate_changes
ALTER TABLE comp_rate_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comp_rate_changes_read" ON comp_rate_changes;
CREATE POLICY "comp_rate_changes_read" ON comp_rate_changes FOR SELECT USING (true);

DROP POLICY IF EXISTS "comp_rate_changes_insert" ON comp_rate_changes;
CREATE POLICY "comp_rate_changes_insert" ON comp_rate_changes FOR INSERT
  WITH CHECK ((auth.jwt() ->> 'user_role') IN ('admin', 'admin_agent'));

-- 4. Fix deals_read RLS — allow all authenticated users to see all deals (for Team Dashboard)
DROP POLICY IF EXISTS "deals_read" ON deals;
CREATE POLICY "deals_read" ON deals FOR SELECT USING (true);

-- 5. Fix deal_notes read — allow all authenticated users (for Team Dashboard context)
DROP POLICY IF EXISTS "notes_read" ON deal_notes;
CREATE POLICY "notes_read" ON deal_notes FOR SELECT USING (true);

-- 6. Back-fill date_issued_paid for existing Issued Paid deals
UPDATE deals SET date_issued_paid = CURRENT_DATE WHERE status = 'Issued Paid' AND date_issued_paid IS NULL;
