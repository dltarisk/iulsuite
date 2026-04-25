-- ============================================================
-- Seed Data for IUL Sales Portal
-- ============================================================
-- NOTE: PIN hashes are bcrypt with cost factor 10.
-- These are pre-computed hashes for the seed PINs:
--   7740 → $2a$10$rQqy1kFGJnHGGNjMHBItAOKdBmFKfhMixJfNGHrk8MIg4hXMFJOyS
--   1923 → $2a$10$N8WMK.XGKSdQE4xLDhT0QuwPjJ/bJuF4HnGz3wYb5rZGqK0pV1T5O
--   1234 → $2a$10$xVqYLRGd.HJhAaLhFTpCBeHDNcecDwJBmTkjMFiu1bkH8C5IYaLKy
--
-- IMPORTANT: Run the hash-pin Edge Function to generate real hashes,
-- then update these values. The hashes below are placeholders that
-- must be replaced with actual bcrypt hashes before use.
-- You can generate them by calling:
--   POST /functions/v1/hash-pin { "pin": "7740" }
-- with an admin JWT.
--
-- For initial setup, we insert with placeholder hashes.
-- The pin-login Edge Function will validate against these.

-- 1. Insert Sandra first (she is the recruiter for others)
INSERT INTO agents (id, name, pin_hash, role, comp_rate, monthly_goal, active)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'Sandra Hernandez',
  '$2a$10$PLACEHOLDER_SANDRA_HASH_REPLACE_ME',
  'admin_agent',
  0.80,
  50000,
  true
);

-- 2. Insert Admin
INSERT INTO agents (id, name, pin_hash, role, comp_rate, monthly_goal, active)
VALUES (
  'a1000000-0000-0000-0000-000000000000',
  'Admin',
  '$2a$10$PLACEHOLDER_ADMIN_HASH_REPLACE_ME_',
  'admin',
  0.00,
  0,
  false
);

-- 3. Insert Valentina (reports to Sandra)
INSERT INTO agents (id, name, pin_hash, role, comp_rate, monthly_goal, active, recruiter_id)
VALUES (
  'a1000000-0000-0000-0000-000000000002',
  'Valentina',
  '$2a$10$PLACEHOLDER_VALENTINA_HASH_REPLAC',
  'agent',
  0.50,
  20000,
  true,
  'a1000000-0000-0000-0000-000000000001'
);

-- 4. Insert Karelin Marte (reports to Sandra)
INSERT INTO agents (id, name, pin_hash, role, comp_rate, monthly_goal, active, recruiter_id)
VALUES (
  'a1000000-0000-0000-0000-000000000003',
  'Karelin Marte',
  '$2a$10$PLACEHOLDER_KARELIN_HASH_REPLACE_',
  'ceo',
  0.50,
  20000,
  true,
  'a1000000-0000-0000-0000-000000000001'
);

-- 5. Sample deals for Sandra
INSERT INTO deals (agent_id, client_name, state, phone, ap, status, is_ny, date_submitted)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Maria Garcia', 'FL', '(305) 555-0101', 3600, 'Issued Paid', false, '2026-03-02'),
  ('a1000000-0000-0000-0000-000000000001', 'Carlos Mendez', 'FL', '(786) 555-0202', 2400, 'Issued', false, '2026-03-05'),
  ('a1000000-0000-0000-0000-000000000001', 'Rosa Jimenez', 'TX', '(713) 555-0303', 1800, 'Submitted', false, '2026-03-15');

-- 6. Sample deals for Valentina
INSERT INTO deals (agent_id, client_name, state, phone, ap, status, is_ny, date_submitted)
VALUES
  ('a1000000-0000-0000-0000-000000000002', 'Pedro Alvarez', 'FL', '(954) 555-0404', 2400, 'Issued Paid', false, '2026-03-03'),
  ('a1000000-0000-0000-0000-000000000002', 'Diana Torres', 'NY', '(917) 555-0505', 3600, 'Issued', true, '2026-03-10'),
  ('a1000000-0000-0000-0000-000000000002', 'Luis Perez', 'FL', '(305) 555-0606', 1800, 'Submitted', false, '2026-03-20');

-- 7. Sample deals for Karelin
INSERT INTO deals (agent_id, client_name, state, phone, ap, status, is_ny, date_submitted)
VALUES
  ('a1000000-0000-0000-0000-000000000003', 'Ana Morales', 'FL', '(786) 555-0707', 2400, 'Issued Paid', false, '2026-03-01'),
  ('a1000000-0000-0000-0000-000000000003', 'Jorge Ramirez', 'FL', '(305) 555-0808', 2400, 'Submitted', false, '2026-03-12'),
  ('a1000000-0000-0000-0000-000000000003', 'Elena Cruz', 'CA', '(323) 555-0909', 1800, 'Submitted', false, '2026-03-22');

-- 8. Sample deal notes
INSERT INTO deal_notes (deal_id, author_id, content)
SELECT d.id, d.agent_id, 'Client very interested in IUL for retirement'
FROM deals d WHERE d.client_name = 'Maria Garcia';

INSERT INTO deal_notes (deal_id, author_id, content)
SELECT d.id, d.agent_id, 'Underwriting approved — clean health history'
FROM deals d WHERE d.client_name = 'Maria Garcia';

INSERT INTO deal_notes (deal_id, author_id, content)
SELECT d.id, d.agent_id, 'Waiting on medical records from PCP'
FROM deals d WHERE d.client_name = 'Rosa Jimenez';

INSERT INTO deal_notes (deal_id, author_id, content)
SELECT d.id, d.agent_id, 'NY case — 100% comp, 50% advance'
FROM deals d WHERE d.client_name = 'Diana Torres';

INSERT INTO deal_notes (deal_id, author_id, content)
SELECT d.id, d.agent_id, 'Follow up with client re: beneficiary info'
FROM deals d WHERE d.client_name = 'Jorge Ramirez';
