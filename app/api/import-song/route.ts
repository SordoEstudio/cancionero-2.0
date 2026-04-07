import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getDemoUserId, isAuthDemoMode } from '@/lib/auth-demo';
import { scrapeSong } from '@/lib/scraper';
import { isScrapeError } from '@/lib/scraper/types';
import { parseSong } from '@/lib/parser';
import {
  analyzeWithGemini,
  geminiResultToParsedSong,
} from '@/lib/ai/gemini-parse';
import { ImportSongSchema } from '@/lib/validation/schemas';
import type { ParsedSong, ParsedSection, ParsedLine } from '@/types';

function parsedSongHasContent(song: ParsedSong): boolean {
  return song.sections.some((sec) =>
    sec.lines.some((l) => l.chords.length > 0 || l.text.trim().length > 0)
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = ImportSongSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Datos de importación inválidos' },
      { status: 400 }
    );
  }

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  const demoImporter = isAuthDemoMode() ? getDemoUserId() : undefined;
  const importedBy = user?.id ?? demoImporter ?? null;

  const supabase = createServiceClient();

  if (parsed.data.mode === 'paste') {
    const { text, title, artist } = parsed.data;
    const hintTitle = title && title.length > 0 ? title : 'Canción pegada';
    const hintArtist = artist && artist.length > 0 ? artist : '';
    const sourceUrl = `paste://${randomUUID()}`;

    let songData: ParsedSong | null = null;

    // Strategy 1: Gemini structured output (preferred — bypasses heuristic parser)
    try {
      const geminiResult = await analyzeWithGemini(text, hintTitle, hintArtist);

      if (geminiResult.mode === 'structured') {
        songData = geminiResultToParsedSong(geminiResult.data, sourceUrl);
        console.log('Gemini structured mode: %d sections', songData.sections.length);
      } else {
        // Gemini returned cleaned text — feed it through the heuristic parser
        const { title: t, artist: a, originalKey, cleanedContent } = geminiResult.data;
        songData = parseSong(
          { title: t, artist: a, sourceUrl, rawContent: cleanedContent },
          { inferChords: false }
        );
        if (originalKey && !songData.originalKey) {
          songData.originalKey = originalKey;
        }
      }
    } catch (aiErr) {
      console.warn('Gemini analysis failed, falling back to heuristic parser:', aiErr);
    }

    // Strategy 2: Heuristic parser fallback (if Gemini failed entirely)
    if (!songData) {
      songData = parseSong(
        { title: hintTitle, artist: hintArtist, sourceUrl, rawContent: text },
        { inferChords: false }
      );
    }

    if (!parsedSongHasContent(songData)) {
      return NextResponse.json(
        { error: 'No se detectó cifra ni letra en el texto.' },
        { status: 422 }
      );
    }

    const { data: song, error: songError } = await supabase
      .from('songs')
      .insert({
        title: songData.title,
        artist: songData.artist,
        source_url: sourceUrl,
        original_key: songData.originalKey,
        imported_by: importedBy,
      })
      .select('id')
      .single();

    if (songError || !song) {
      console.error('Error guardando canción (pegado):', songError);
      return NextResponse.json({ error: 'Error al guardar la canción' }, { status: 500 });
    }

    try {
      await saveSections(supabase, song.id, songData.sections);
    } catch (err) {
      console.error('Error guardando secciones (pegado):', err);
    }

    return NextResponse.json({
      id: song.id,
      title: songData.title,
      artist: songData.artist,
    });
  }

  const url = parsed.data.url;

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

  const songData: ParsedSong = parseSong(scrapeResult);

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

  try {
    await saveSections(supabase, song.id, songData.sections);
  } catch (err) {
    console.error('Error guardando secciones:', err);
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
