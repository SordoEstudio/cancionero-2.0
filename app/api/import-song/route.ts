import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getDemoUserId, isAuthDemoMode } from '@/lib/auth-demo';
import { scrapeSong } from '@/lib/scraper';
import { isScrapeError } from '@/lib/scraper/types';
import { parseSong } from '@/lib/parser';
import { ImportSongSchema } from '@/lib/validation/schemas';
import type { ParsedSong, ParsedSection, ParsedLine } from '@/types';

export async function POST(request: NextRequest) {
  // 1. Validar body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = ImportSongSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'URL inválida' },
      { status: 400 }
    );
  }

  const { url } = parsed.data;

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  const demoImporter = isAuthDemoMode() ? getDemoUserId() : undefined;
  const importedBy = user?.id ?? demoImporter ?? null;

  const supabase = createServiceClient();

  // 2. Verificar si ya fue importada (deduplicación)
  const { data: existing } = await supabase
    .from('songs')
    .select('id, title, artist')
    .eq('source_url', url)
    .maybeSingle();

  if (existing) {
    if (user?.id) {
      const { data: row } = await supabase
        .from('songs')
        .select('imported_by')
        .eq('id', existing.id)
        .single();
      if (row?.imported_by === null) {
        await supabase.from('songs').update({ imported_by: user.id }).eq('id', existing.id);
      }
    }
    return NextResponse.json({ id: existing.id, title: existing.title, artist: existing.artist });
  }

  // 3. Scraping
  const scrapeResult = await scrapeSong(url);
  if (isScrapeError(scrapeResult)) {
    const statusMap: Record<string, number> = {
      SITE_UNSUPPORTED: 400,
      FETCH_FAILED: 502,
      PARSE_FAILED: 422,
      EMPTY_CONTENT: 422,
    };
    return NextResponse.json(
      { error: scrapeResult.message, code: scrapeResult.code },
      { status: statusMap[scrapeResult.code] ?? 500 }
    );
  }

  // 4. Parsear
  const songData: ParsedSong = parseSong(scrapeResult);

  // 5. Guardar en Supabase (imported_by = usuario logueado o demo, para que aparezca en GET /api/songs)
  const { data: song, error: songError } = await supabase
    .from('songs')
    .insert({
      title: songData.title,
      artist: songData.artist,
      source_url: url,
      original_key: songData.originalKey,
      imported_by: importedBy,
    })
    .select('id')
    .single();

  if (songError || !song) {
    console.error('Error guardando canción:', songError);
    return NextResponse.json({ error: 'Error al guardar la canción' }, { status: 500 });
  }

  // 6. Guardar secciones y líneas
  try {
    await saveSections(supabase, song.id, songData.sections);
  } catch (err) {
    console.error('Error guardando secciones:', err);
    // La canción ya fue guardada, no es fatal
  }

  return NextResponse.json({
    id: song.id,
    title: songData.title,
    artist: songData.artist,
  });
}

async function saveSections(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  songId: string,
  sections: ParsedSection[]
) {
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const section = sections[sIdx];

    const { data: dbSection, error: sectionError } = await supabase
      .from('song_sections')
      .insert({
        song_id: songId,
        type: section.type,
        label: section.label,
        position: sIdx,
      })
      .select('id')
      .single();

    if (sectionError || !dbSection) {
      throw new Error(`Error guardando sección ${sIdx}: ${sectionError?.message}`);
    }

    await saveLines(supabase, dbSection.id, section.lines);
  }
}

async function saveLines(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sectionId: string,
  lines: ParsedLine[]
) {
  if (lines.length === 0) return;

  const rows = lines.map((line, lIdx) => ({
    section_id: sectionId,
    position: lIdx,
    chords: line.chords,
    text: line.text,
  }));

  const { error } = await supabase.from('song_lines').insert(rows);
  if (error) {
    throw new Error(`Error guardando líneas: ${error.message}`);
  }
}
