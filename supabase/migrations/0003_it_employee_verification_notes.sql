-- ============================================================================
-- 0003_it_employee_verification_notes.sql
-- Adds verification status and a single overwritable notes field to employees.
-- ============================================================================

alter table it_employees
  add column if not exists verified boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists notes text;
