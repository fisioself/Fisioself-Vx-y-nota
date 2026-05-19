create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'therapist' check (role in ('admin', 'therapist', 'assistant')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists therapists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) >= 2),
  phone text,
  email text,
  sex text check (sex in ('M', 'F', 'Otro') or sex is null),
  birth_date date,
  occupation text,
  medical_diagnosis text,
  functional_diagnosis text,
  status text not null default 'En valoracion' check (status in ('En valoracion', 'En tratamiento', 'Alta', 'Seguimiento', 'Inactivo')),
  assigned_therapist_id uuid references therapists(id),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists evaluations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  therapist_id uuid references therapists(id),
  evaluation_date date not null default current_date,
  eva_initial numeric check (eva_initial >= 0 and eva_initial <= 10),
  sections jsonb not null default '{}'::jsonb,
  red_flags text,
  prognosis text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists session_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  therapist_id uuid references therapists(id),
  session_number integer not null check (session_number > 0),
  session_date date not null default current_date,
  eva numeric check (eva >= 0 and eva <= 10),
  subjective text,
  objective text,
  assessment text,
  plan text,
  raw_text text not null check (length(trim(raw_text)) >= 3),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists follow_ups (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  therapist_id uuid references therapists(id),
  day_number integer not null check (day_number in (7, 30, 90)),
  scheduled_date date not null,
  status text not null default 'Pendiente',
  notes text,
  contacted_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists ai_consults (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  therapist_id uuid references therapists(id),
  type text not null,
  input_text text not null,
  output_text text not null,
  validated boolean not null default false,
  validation_notes text,
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid default auth.uid() references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table therapists enable row level security;
alter table patients enable row level security;
alter table evaluations enable row level security;
alter table session_notes enable row level security;
alter table follow_ups enable row level security;
alter table ai_consults enable row level security;
alter table audit_log enable row level security;

create policy "profiles read own" on profiles for select to authenticated using (id = auth.uid());
create policy "profiles update own" on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles insert own" on profiles for insert to authenticated with check (id = auth.uid());

create policy "therapists authenticated read" on therapists for select to authenticated using (true);
create policy "therapists authenticated insert" on therapists for insert to authenticated with check (true);
create policy "therapists authenticated update" on therapists for update to authenticated using (true) with check (true);

create policy "patients authenticated read" on patients for select to authenticated using (true);
create policy "patients authenticated insert" on patients for insert to authenticated with check (created_by = auth.uid());
create policy "patients authenticated update" on patients for update to authenticated using (true) with check (true);

create policy "evaluations authenticated read" on evaluations for select to authenticated using (true);
create policy "evaluations authenticated insert" on evaluations for insert to authenticated with check (created_by = auth.uid());
create policy "evaluations authenticated update" on evaluations for update to authenticated using (true) with check (true);

create policy "session notes authenticated read" on session_notes for select to authenticated using (true);
create policy "session notes authenticated insert" on session_notes for insert to authenticated with check (created_by = auth.uid());
create policy "session notes authenticated update" on session_notes for update to authenticated using (true) with check (true);

create policy "follow ups authenticated read" on follow_ups for select to authenticated using (true);
create policy "follow ups authenticated insert" on follow_ups for insert to authenticated with check (created_by = auth.uid());
create policy "follow ups authenticated update" on follow_ups for update to authenticated using (true) with check (true);

create policy "ai consults authenticated read" on ai_consults for select to authenticated using (true);
create policy "ai consults authenticated insert" on ai_consults for insert to authenticated with check (created_by = auth.uid());
create policy "ai consults authenticated update" on ai_consults for update to authenticated using (true) with check (true);

create policy "audit authenticated read" on audit_log for select to authenticated using (true);
create policy "audit authenticated insert" on audit_log for insert to authenticated with check (actor_id = auth.uid());
