-- ============================================================================
-- 0002_seed_it_regions_arges.sql
-- Seeds the 15 IT regions and Arges's employee list.
-- Other regions are created empty; add their employees later via the app's
-- admin screen, or with additional seed migrations.
-- ============================================================================

insert into it_regions (name, slug, sort_order) values
  ('Arges',               'arges',               1),
  ('B1',                  'b1',                  2),
  ('B2',                  'b2',                  3),
  ('B3',                  'b3',                  4),
  ('Bacau',                'bacau',               5),
  ('Bihor-Maramures',     'bihor-maramures',     6),
  ('Cluj',                'cluj',                7),
  ('Constanta-Calarasi',  'constanta-calarasi',  8),
  ('Galati',               'galati',              9),
  ('Iasi',                 'iasi',               10),
  ('Mures',                'mures',              11),
  ('Office',              'office',              12),
  ('Oltenia',             'oltenia',             13),
  ('Prahova-Brasov',      'prahova-brasov',      14),
  ('Sibiu',                'sibiu',              15),
  ('Timisoara-Deva',      'timisoara-deva',      16)
on conflict (slug) do nothing;

insert into it_employees (region_id, full_name)
select r.id, emp_name
from it_regions r, unnest(array[
  'Baetica Denisa',
  'Catrina Veronica Elena',
  'Dicu Sorin',
  'Dobarceanu Melania',
  'Jianu Ionut Adrian',
  'Luca Raluca',
  'Stefan Nicoleta',
  'Stroe Alexandra Maria',
  'Zavoianu Cristian'
]) as emp_name
where r.slug = 'arges'
on conflict (region_id, full_name) do nothing;
