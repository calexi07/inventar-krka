# Inventar Companie

Internal inventory app for company vehicles and IT equipment. Static
frontend (no build step) on GitHub Pages, backed by Supabase.

## Status

- **IT module**: in progress. Entry splits into **Auto** / **IT**; IT is
  organized as `Region → Employee → Photos`. Auto is not built yet.
- **Auth**: not implemented yet. RLS policies are currently open
  (`it_open_*`) so the app works without a login screen. Before this app
  is reachable outside a trusted network, replace those policies with
  auth-scoped ones — see the note at the top of
  `supabase/migrations/0001_it_schema.sql`.

## Tech stack

- Vanilla JavaScript (ES modules), no bundler/build step
- Tailwind CSS (via CDN) + a small custom stylesheet (`css/styles.css`) for
  the app's own design tokens and the folder-tab card component
- Supabase: Postgres, Row Level Security, Storage (photos)
- Hosting: GitHub Pages (static files, deploy on push)

## Project structure

```
index.html                 Landing page — Auto / IT split
it/
  index.html                Region grid (IT)
  region.html                Employee list for a region
  employee.html               Employee detail — photo gallery + upload
js/
  config.example.js          Template for Supabase credentials (copy → config.js)
  supabase-client.js         Shared Supabase client
  ui-utils.js                 Small DOM/toast/error helpers
  it-regions.js               Logic for it/index.html
  it-employees.js             Logic for it/region.html
  it-employee-detail.js       Logic for it/employee.html
css/
  styles.css                  Design tokens + folder-card component
supabase/
  migrations/
    0001_it_schema.sql        Tables, RLS, storage bucket for IT module
    0002_seed_it_regions_arges.sql   Seeds the 15 regions + Arges's employees
```

## Local setup

1. Copy `js/config.example.js` to `js/config.js` and fill in your
   Supabase project's URL and anon/public key (Project Settings → API in
   the Supabase dashboard). `config.js` is gitignored — never commit it.
2. Serve the folder with any static file server, e.g.:
   ```
   npx serve .
   ```
   (Opening `index.html` directly via `file://` will not work — ES module
   imports require an HTTP server.)

## Supabase setup

1. Create a Supabase project.
2. Apply the migrations in order, either via the Supabase CLI:
   ```
   supabase link --project-ref your-project-ref
   supabase db push
   ```
   or by pasting each file's contents into the SQL editor in order
   (`0001_...` then `0002_...`).
3. Confirm the `it-photos` storage bucket was created (Storage tab) —
   it's created by the first migration, not manually.

## Deployment (GitHub Pages)

1. Push this repo to GitHub.
2. Repo Settings → Pages → deploy from the branch/folder containing these
   files.
3. Make sure `js/config.js` exists in the deployed branch with real
   values — it's gitignored locally, so on a fresh checkout you must
   recreate it (or, since the anon key is safe for client exposure by
   design, some teams choose to commit `config.js` directly instead of
   `.gitignore`-ing it — your call, just never do this with a
   service-role key).

## Adding more regions' employees

`0002_seed_it_regions_arges.sql` only seeds Arges. For the rest, either:
- use the **+ Regiune nouă** / **+ Angajat nou** buttons in the app, or
- add another migration following the same pattern.

## Architectural notes

- **Photos live in a private Storage bucket** (`it-photos`), referenced
  by `it_employee_photos` rows — never a public bucket. The gallery reads
  them via short-lived signed URLs, not public links.
- **No `equipment` table yet.** The current scope is photos per employee.
  If you later want structured fields (serial number, asset tag, model),
  add an `it_equipment` table linked to `employee_id` — don't retrofit
  photo metadata to carry that instead.
- **Regions/employees are deletable-with-guardrails**: an employee can't
  be force-deleted without deleting their photos first is *not* enforced
  (`on delete cascade` handles that automatically); a region *can't* be
  deleted while employees still reference it (`on delete restrict`) —
  reassign or remove employees first.
