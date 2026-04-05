-- Política RLS para borrar canciones propias (cascade a secciones, líneas y versiones).
create policy "songs_delete_own"
  on songs for delete
  using (auth.uid() = imported_by);
