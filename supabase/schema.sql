-- ============================================================
-- Cancionero Pro — Schema SQL
-- Ejecutar en Supabase: SQL Editor → New query → Run
-- ============================================================

-- UUID generation
create extension if not exists "pgcrypto";

-- ─── Enum de tipos de sección ─────────────────────────────────────────────
create type section_type as enum (
  'intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'solo', 'outro', 'unknown'
);

-- ─── songs ────────────────────────────────────────────────────────────────
-- Canción canónica, globalmente legible, una fila por URL fuente
create table songs (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  artist       text not null default '',
  source_url   text not null unique,
  original_key text,
  imported_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_songs_imported_by on songs(imported_by);
create index idx_songs_source_url  on songs(source_url);

-- ─── song_sections ────────────────────────────────────────────────────────
create table song_sections (
  id         uuid primary key default gen_random_uuid(),
  song_id    uuid not null references songs(id) on delete cascade,
  type       section_type not null default 'unknown',
  label      text,
  position   int not null,
  created_at timestamptz not null default now()
);

create index idx_song_sections_song_id on song_sections(song_id);

-- ─── song_lines ───────────────────────────────────────────────────────────
-- chords: [{position: int, chord: text}]
-- Ejemplo: [{"position":0,"chord":"Am"},{"position":5,"chord":"F"}]
create table song_lines (
  id         uuid primary key default gen_random_uuid(),
  section_id uuid not null references song_sections(id) on delete cascade,
  position   int not null,
  chords     jsonb not null default '[]'::jsonb,
  text       text not null default '',
  created_at timestamptz not null default now()
);

create index idx_song_lines_section_id on song_lines(section_id);
create index idx_song_lines_chords     on song_lines using gin(chords);

-- ─── song_versions ────────────────────────────────────────────────────────
create table song_versions (
  id              uuid primary key default gen_random_uuid(),
  song_id         uuid not null references songs(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null default 'Mi versión',
  key             text,
  capo            int not null default 0,
  transpose_steps int not null default 0,
  view_mode       text not null default 'default',
  scroll_speed    int,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_song_versions_user_id on song_versions(user_id);
create index idx_song_versions_song_id on song_versions(song_id);

-- ─── version_lines ────────────────────────────────────────────────────────
-- Modelo delta: solo líneas que difieren del original
-- Referencia song_line_id directamente (no por posición)
create table version_lines (
  id           uuid primary key default gen_random_uuid(),
  version_id   uuid not null references song_versions(id) on delete cascade,
  song_line_id uuid not null references song_lines(id) on delete cascade,
  chords       jsonb not null default '[]'::jsonb,
  text         text,
  created_at   timestamptz not null default now(),
  unique (version_id, song_line_id)
);

create index idx_version_lines_version_id   on version_lines(version_id);
create index idx_version_lines_song_line_id on version_lines(song_line_id);

-- ─── Trigger updated_at ───────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_songs_updated_at
  before update on songs
  for each row execute function set_updated_at();

create trigger trg_song_versions_updated_at
  before update on song_versions
  for each row execute function set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────
alter table songs          enable row level security;
alter table song_sections  enable row level security;
alter table song_lines     enable row level security;
alter table song_versions  enable row level security;
alter table version_lines  enable row level security;

-- songs: lectura pública, escritura solo del importador
create policy "songs_select_public"
  on songs for select using (true);

create policy "songs_insert_authenticated"
  on songs for insert
  with check (auth.uid() = imported_by);

create policy "songs_update_own"
  on songs for update
  using (auth.uid() = imported_by);

create policy "songs_delete_own"
  on songs for delete
  using (auth.uid() = imported_by);

-- song_sections y song_lines: solo lectura pública (escritura vía server action)
create policy "song_sections_select_public"
  on song_sections for select using (true);

create policy "song_sections_insert_authenticated"
  on song_sections for insert
  with check (
    exists (select 1 from songs s where s.id = song_id and s.imported_by = auth.uid())
  );

create policy "song_lines_select_public"
  on song_lines for select using (true);

create policy "song_lines_insert_authenticated"
  on song_lines for insert
  with check (
    exists (
      select 1 from song_sections ss
      join songs s on s.id = ss.song_id
      where ss.id = section_id and s.imported_by = auth.uid()
    )
  );

-- song_versions: totalmente privado al dueño
create policy "song_versions_select_own"
  on song_versions for select using (auth.uid() = user_id);

create policy "song_versions_insert_own"
  on song_versions for insert with check (auth.uid() = user_id);

create policy "song_versions_update_own"
  on song_versions for update using (auth.uid() = user_id);

create policy "song_versions_delete_own"
  on song_versions for delete using (auth.uid() = user_id);

-- version_lines: accesible solo a través de la versión del dueño
create policy "version_lines_select_own"
  on version_lines for select
  using (exists (
    select 1 from song_versions sv
    where sv.id = version_lines.version_id
      and sv.user_id = auth.uid()
  ));

create policy "version_lines_insert_own"
  on version_lines for insert
  with check (exists (
    select 1 from song_versions sv
    where sv.id = version_lines.version_id
      and sv.user_id = auth.uid()
  ));

create policy "version_lines_delete_own"
  on version_lines for delete
  using (exists (
    select 1 from song_versions sv
    where sv.id = version_lines.version_id
      and sv.user_id = auth.uid()
  ));
