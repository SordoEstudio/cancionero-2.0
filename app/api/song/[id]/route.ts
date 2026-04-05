import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { inferChordsInSections } from '@/lib/parser/chord-inference';
import { GetSongSchema } from '@/lib/validation/schemas';
import { getDemoUserId, isAuthDemoMode } from '@/lib/auth-demo';
import { viewModeFromDb } from '@/lib/version-prefs';
import { applyLineOverridesToSections, type VersionLineOverride } from '@/lib/version-merge';
import type { ChordToken, FullSong, SongVersionActive } from '@/types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** GET /api/song/:id — canción completa con secciones y líneas; ?version=uuid aplica una versión guardada */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const validation = GetSongSchema.safeParse({ id });
  if (!validation.success) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const supabase = await createClient();

  // Canción base
  const { data: song, error: songError } = await supabase
    .from('songs')
    .select('*')
    .eq('id', id)
    .single();

  if (songError || !song) {
    return NextResponse.json({ error: 'Canción no encontrada' }, { status: 404 });
  }

  // Secciones
  const { data: sections, error: sectionsError } = await supabase
    .from('song_sections')
    .select('*')
    .eq('song_id', id)
    .order('position', { ascending: true });

  if (sectionsError) {
    return NextResponse.json({ error: 'Error cargando secciones' }, { status: 500 });
  }

  // Líneas de todas las secciones
  const sectionIds = (sections ?? []).map((s) => s.id);
  const { data: lines, error: linesError } = await supabase
    .from('song_lines')
    .select('*')
    .in('section_id', sectionIds.length ? sectionIds : ['00000000-0000-0000-0000-000000000000'])
    .order('position', { ascending: true });

  if (linesError) {
    return NextResponse.json({ error: 'Error cargando líneas' }, { status: 500 });
  }

  // Agrupar líneas por sección
  const linesBySection: Record<string, typeof lines> = {};
  for (const line of lines ?? []) {
    if (!linesBySection[line.section_id]) linesBySection[line.section_id] = [];
    linesBySection[line.section_id].push(line);
  }

  const fullSong: FullSong = {
    ...song,
    sections: (sections ?? []).map((section) => ({
      id: section.id,
      type: section.type,
      label: section.label ?? section.type,
      position: section.position,
      lines: (linesBySection[section.id] ?? []).map((line) => ({
        id: line.id,
        chords: line.chords,
        text: line.text,
      })),
    })),
  };

  fullSong.sections = inferChordsInSections(fullSong.sections);

  const versionId =
    request.nextUrl.searchParams.get('version') ?? request.nextUrl.searchParams.get('v');
  if (!versionId || !UUID_RE.test(versionId)) {
    return NextResponse.json({ song: fullSong });
  }

  type VerRow = {
    id: string;
    name: string;
    song_id: string;
    key: string | null;
    capo: number;
    transpose_steps: number | null;
    view_mode: string | null;
    scroll_speed: number | null;
  };

  let ver: VerRow | null = null;
  let lineRows: { song_line_id: string; chords: unknown; text: string | null }[] | null = null;

  const versionSelect =
    'id, name, song_id, key, capo, transpose_steps, view_mode, scroll_speed';

  if (isAuthDemoMode()) {
    const demoId = getDemoUserId();
    if (demoId) {
      const admin = createServiceClient();
      const { data: v } = await admin
        .from('song_versions')
        .select(versionSelect)
        .eq('id', versionId)
        .eq('song_id', id)
        .eq('user_id', demoId)
        .maybeSingle();
      ver = v as VerRow | null;
      if (ver) {
        const { data: lines } = await admin
          .from('version_lines')
          .select('song_line_id, chords, text')
          .eq('version_id', versionId);
        lineRows = lines;
      }
    }
  } else {
    const { data: v } = await supabase
      .from('song_versions')
      .select(versionSelect)
      .eq('id', versionId)
      .eq('song_id', id)
      .maybeSingle();
    ver = v as VerRow | null;
    if (ver) {
      const { data: lines } = await supabase
        .from('version_lines')
        .select('song_line_id, chords, text')
        .eq('version_id', versionId);
      lineRows = lines;
    }
  }

  if (!ver) {
    return NextResponse.json({ error: 'Versión no encontrada' }, { status: 404 });
  }

  const map = new Map<string, VersionLineOverride>();
  for (const row of lineRows ?? []) {
    map.set(row.song_line_id, {
      chords: (row.chords as ChordToken[]) ?? [],
      text: row.text,
    });
  }

  const displaySections = applyLineOverridesToSections(fullSong.sections, map);

  const activeVersion: SongVersionActive = {
    id: ver.id,
    name: ver.name,
    key: ver.key,
    capo: ver.capo ?? 0,
    transpose_steps: ver.transpose_steps ?? 0,
    view_mode: viewModeFromDb(ver.view_mode),
    scroll_speed: ver.scroll_speed,
  };

  return NextResponse.json({
    song: fullSong,
    displaySections,
    activeVersion,
  });
}
