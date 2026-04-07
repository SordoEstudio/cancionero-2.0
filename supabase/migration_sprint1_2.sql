-- ============================================================
-- Sprint 1 + 2: favoritos, etiquetas, setlists, notas
-- ============================================================

-- ─── user_favorites ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_favorites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id    uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);

ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_favorites_select_own" ON user_favorites
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_favorites_insert_own" ON user_favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_favorites_delete_own" ON user_favorites
  FOR DELETE USING (auth.uid() = user_id);

-- ─── user_tags ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '#64748b',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_user_tags_user_id ON user_tags(user_id);

ALTER TABLE user_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_tags_select_own" ON user_tags
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_tags_insert_own" ON user_tags
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_tags_update_own" ON user_tags
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "user_tags_delete_own" ON user_tags
  FOR DELETE USING (auth.uid() = user_id);

-- ─── song_tags (join) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS song_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id     uuid NOT NULL REFERENCES user_tags(id) ON DELETE CASCADE,
  song_id    uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tag_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_song_tags_tag_id  ON song_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_song_tags_song_id ON song_tags(song_id);

ALTER TABLE song_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "song_tags_select_own" ON song_tags
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM user_tags t WHERE t.id = song_tags.tag_id AND t.user_id = auth.uid()
  ));
CREATE POLICY "song_tags_insert_own" ON song_tags
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM user_tags t WHERE t.id = song_tags.tag_id AND t.user_id = auth.uid()
  ));
CREATE POLICY "song_tags_delete_own" ON song_tags
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM user_tags t WHERE t.id = song_tags.tag_id AND t.user_id = auth.uid()
  ));

-- ─── setlists ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS setlists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_public   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_setlists_user_id ON setlists(user_id);

CREATE TRIGGER trg_setlists_updated_at
  BEFORE UPDATE ON setlists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE setlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "setlists_select_own_or_public" ON setlists
  FOR SELECT USING (auth.uid() = user_id OR is_public = true);
CREATE POLICY "setlists_insert_own" ON setlists
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "setlists_update_own" ON setlists
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "setlists_delete_own" ON setlists
  FOR DELETE USING (auth.uid() = user_id);

-- ─── setlist_songs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS setlist_songs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setlist_id  uuid NOT NULL REFERENCES setlists(id) ON DELETE CASCADE,
  song_id     uuid NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  position    int NOT NULL DEFAULT 0,
  version_id  uuid REFERENCES song_versions(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(setlist_id, song_id)
);

CREATE INDEX IF NOT EXISTS idx_setlist_songs_setlist_id ON setlist_songs(setlist_id);

ALTER TABLE setlist_songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "setlist_songs_select_own" ON setlist_songs
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM setlists s WHERE s.id = setlist_songs.setlist_id
      AND (s.user_id = auth.uid() OR s.is_public = true)
  ));
CREATE POLICY "setlist_songs_insert_own" ON setlist_songs
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM setlists s WHERE s.id = setlist_songs.setlist_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "setlist_songs_delete_own" ON setlist_songs
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM setlists s WHERE s.id = setlist_songs.setlist_id AND s.user_id = auth.uid()
  ));
CREATE POLICY "setlist_songs_update_own" ON setlist_songs
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM setlists s WHERE s.id = setlist_songs.setlist_id AND s.user_id = auth.uid()
  ));

-- ─── notes en song_versions ─────────────────────────────────
ALTER TABLE song_versions
  ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
