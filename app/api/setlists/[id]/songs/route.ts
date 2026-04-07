import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getApiUserId, isAuthOk } from '@/lib/api/get-user-id';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function assertSetlistOwner(
  supabase: ReturnType<typeof createServiceClient>,
  setlistId: string,
  userId: string
) {
  const { data } = await supabase
    .from('setlists')
    .select('id')
    .eq('id', setlistId)
    .eq('user_id', userId)
    .maybeSingle();
  return data;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getApiUserId();
  if (!isAuthOk(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: setlistId } = await params;
  if (!UUID_RE.test(setlistId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || !('songId' in body)) {
    return NextResponse.json({ error: 'Falta songId' }, { status: 400 });
  }

  const songId = (body as { songId: unknown }).songId;
  if (typeof songId !== 'string' || !UUID_RE.test(songId)) {
    return NextResponse.json({ error: 'songId inválido' }, { status: 400 });
  }

  let versionId: string | null = null;
  if ('versionId' in body && (body as { versionId: unknown }).versionId !== undefined) {
    const v = (body as { versionId: unknown }).versionId;
    if (v !== null && (typeof v !== 'string' || !UUID_RE.test(v))) {
      return NextResponse.json({ error: 'versionId inválido' }, { status: 400 });
    }
    versionId = v === null ? null : v;
  }

  const supabase = createServiceClient();
  const owned = await assertSetlistOwner(supabase, setlistId, auth.userId);
  if (!owned) {
    return NextResponse.json({ error: 'Setlist no encontrada' }, { status: 404 });
  }

  if (versionId) {
    const { data: ver } = await supabase
      .from('song_versions')
      .select('song_id, user_id')
      .eq('id', versionId)
      .maybeSingle();

    if (!ver || ver.user_id !== auth.userId || ver.song_id !== songId) {
      return NextResponse.json({ error: 'Versión inválida' }, { status: 400 });
    }
  }

  const { data: maxRow } = await supabase
    .from('setlist_songs')
    .select('position')
    .eq('setlist_id', setlistId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = (maxRow?.position ?? -1) + 1;

  const { error } = await supabase.from('setlist_songs').insert({
    setlist_id: setlistId,
    song_id: songId,
    position: nextPosition,
    version_id: versionId,
  });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'La canción ya está en el setlist' }, { status: 409 });
    }
    console.error('setlist_songs POST:', error);
    return NextResponse.json({ error: 'No se pudo agregar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getApiUserId();
  if (!isAuthOk(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: setlistId } = await params;
  if (!UUID_RE.test(setlistId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || !('songId' in body)) {
    return NextResponse.json({ error: 'Falta songId' }, { status: 400 });
  }

  const songId = (body as { songId: unknown }).songId;
  if (typeof songId !== 'string' || !UUID_RE.test(songId)) {
    return NextResponse.json({ error: 'songId inválido' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const owned = await assertSetlistOwner(supabase, setlistId, auth.userId);
  if (!owned) {
    return NextResponse.json({ error: 'Setlist no encontrada' }, { status: 404 });
  }

  const { error } = await supabase
    .from('setlist_songs')
    .delete()
    .eq('setlist_id', setlistId)
    .eq('song_id', songId);

  if (error) {
    console.error('setlist_songs DELETE:', error);
    return NextResponse.json({ error: 'No se pudo quitar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getApiUserId();
  if (!isAuthOk(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id: setlistId } = await params;
  if (!UUID_RE.test(setlistId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || !('songs' in body)) {
    return NextResponse.json({ error: 'Falta songs' }, { status: 400 });
  }

  const songs = (body as { songs: unknown }).songs;
  if (!Array.isArray(songs) || songs.length === 0) {
    return NextResponse.json({ error: 'songs debe ser un array no vacío' }, { status: 400 });
  }

  for (const item of songs) {
    if (typeof item !== 'object' || item === null) {
      return NextResponse.json({ error: 'Entrada inválida en songs' }, { status: 400 });
    }
    const o = item as Record<string, unknown>;
    if (typeof o.songId !== 'string' || !UUID_RE.test(o.songId)) {
      return NextResponse.json({ error: 'songId inválido en songs' }, { status: 400 });
    }
    if (typeof o.position !== 'number' || !Number.isInteger(o.position) || o.position < 0) {
      return NextResponse.json({ error: 'position inválida en songs' }, { status: 400 });
    }
  }

  const supabase = createServiceClient();
  const owned = await assertSetlistOwner(supabase, setlistId, auth.userId);
  if (!owned) {
    return NextResponse.json({ error: 'Setlist no encontrada' }, { status: 404 });
  }

  for (const item of songs as { songId: string; position: number }[]) {
    const { error } = await supabase
      .from('setlist_songs')
      .update({ position: item.position })
      .eq('setlist_id', setlistId)
      .eq('song_id', item.songId);

    if (error) {
      console.error('setlist_songs PATCH:', error);
      return NextResponse.json({ error: 'No se pudo reordenar' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
