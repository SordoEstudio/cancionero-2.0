-- Ejecutar en Supabase SQL Editor si ya tenías song_versions sin estas columnas.
alter table song_versions
  add column if not exists transpose_steps int not null default 0,
  add column if not exists view_mode text not null default 'default',
  add column if not exists scroll_speed int;

comment on column song_versions.transpose_steps is 'Transporte en semitonos respecto al tono original de la canción';
comment on column song_versions.view_mode is 'default | inline | chords-only | lyrics-only';
comment on column song_versions.scroll_speed is 'Velocidad scroll automático px/s (null = usar 40 por defecto en cliente)';
