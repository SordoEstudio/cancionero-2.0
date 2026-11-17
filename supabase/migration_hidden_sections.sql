-- Migration: agregar hidden_sections a song_versions
-- Ejecutar en Supabase: SQL Editor → New query → Run

alter table song_versions
  add column if not exists hidden_sections jsonb not null default '[]'::jsonb;
