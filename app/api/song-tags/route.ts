import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getApiUserId, isAuthOk } from '@/lib/api/get-user-id';
import { isUuid } from '@/lib/validation/uuid';

export async function GET() {
  const auth = await getApiUserId();
  if (!isAuthOk(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createServiceClient();
  const { data: tagRows, error: tagErr } = await supabase
    .from('user_tags')
    .select('id')
    .eq('user_id', auth.userId);

  if (tagErr) {
    console.error('song-tags GET (tags):', tagErr);
    return NextResponse.json({ error: 'Error al obtener etiquetas' }, { status: 500 });
  }

  const tagIds = (tagRows ?? []).map((r) => r.id as string);
  if (tagIds.length === 0) {
    return NextResponse.json({ songTags: {} as Record<string, string[]> });
  }

  const { data: stRows, error: stErr } = await supabase
    .from('song_tags')
    .select('song_id, tag_id')
    .in('tag_id', tagIds);

  if (stErr) {
    console.error('song-tags GET:', stErr);
    return NextResponse.json({ error: 'Error al obtener asignaciones' }, { status: 500 });
  }

  const songTags: Record<string, string[]> = {};
  for (const row of stRows ?? []) {
    const sid = row.song_id as string;
    const tid = row.tag_id as string;
    if (!songTags[sid]) songTags[sid] = [];
    songTags[sid].push(tid);
  }

  return NextResponse.json({ songTags });
}

export async function POST(request: NextRequest) {
  const auth = await getApiUserId();
  if (!isAuthOk(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const { tagId, songId } = body as { tagId?: unknown; songId?: unknown };
  if (typeof tagId !== 'string' || typeof songId !== 'string' || !isUuid(tagId) || !isUuid(songId)) {
    return NextResponse.json({ error: 'tagId y songId deben ser UUID válidos' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: owned, error: ownErr } = await supabase
    .from('user_tags')
    .select('id')
    .eq('id', tagId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (ownErr) {
    console.error('song-tags POST (own):', ownErr);
    return NextResponse.json({ error: 'Error al validar etiqueta' }, { status: 500 });
  }
  if (!owned) {
    return NextResponse.json({ error: 'Etiqueta no encontrada' }, { status: 404 });
  }

  const { error } = await supabase.from('song_tags').insert({ tag_id: tagId, song_id: songId });

  if (error) {
    console.error('song-tags POST:', error);
    return NextResponse.json({ error: 'No se pudo asignar la etiqueta' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await getApiUserId();
  if (!isAuthOk(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const { tagId, songId } = body as { tagId?: unknown; songId?: unknown };
  if (typeof tagId !== 'string' || typeof songId !== 'string' || !isUuid(tagId) || !isUuid(songId)) {
    return NextResponse.json({ error: 'tagId y songId deben ser UUID válidos' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: owned, error: ownErr } = await supabase
    .from('user_tags')
    .select('id')
    .eq('id', tagId)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (ownErr) {
    console.error('song-tags DELETE (own):', ownErr);
    return NextResponse.json({ error: 'Error al validar etiqueta' }, { status: 500 });
  }
  if (!owned) {
    return NextResponse.json({ error: 'Etiqueta no encontrada' }, { status: 404 });
  }

  const { error } = await supabase.from('song_tags').delete().eq('tag_id', tagId).eq('song_id', songId);

  if (error) {
    console.error('song-tags DELETE:', error);
    return NextResponse.json({ error: 'No se pudo quitar la etiqueta' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
