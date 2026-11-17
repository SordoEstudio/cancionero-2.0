-- Migration: agregar section_type_overrides y hidden_lines a song_versions
-- Ejecutar en Supabase: SQL Editor → New query → Run

alter table song_versions
  add column if not exists section_type_overrides jsonb not null default '{}'::jsonb;

alter table song_versions
  add column if not exists hidden_lines jsonb not null default '[]'::jsonb;
