import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getApiUserId, isAuthOk } from '@/lib/api/get-user-id';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SongJoin = {
  title: string;
  artist: string;
  original_key: string | null;
} | null;

function nestedSong(songs: unknown): SongJoin {
  if (songs && typeof songs === 'object' && !Array.isArray(songs)) {
    return songs as SongJoin;
  }
  if (Array.isArray(songs) && songs[0] && typeof songs[0] === 'object') {
    return songs[0] as SongJoin;
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getApiUserId();
  if (!isAuthOk(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: setlist, error: setlistErr } = await supabase
    .from('setlists')
    .select('id, user_id, name, description, is_public, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();

  if (setlistErr || !setlist) {
    return NextResponse.json({ error: 'Setlist no encontrada' }, { status: 404 });
  }

  if (setlist.user_id !== auth.userId && !setlist.is_public) {
    return NextResponse.json({ error: 'Setlist no encontrada' }, { status: 404 });
  }

  const { data: rawSongs, error: songsErr } = await supabase
    .from('setlist_songs')
    .select('id, song_id, position, version_id, songs(title, artist, original_key)')
    .eq('setlist_id', id)
    .order('position', { ascending: true });

  if (songsErr) {
    console.error('setlist songs GET:', songsErr);
    return NextResponse.json({ error: 'No se pudo cargar' }, { status: 500 });
  }

  const rows = rawSongs ?? [];
  const songs = rows.map((row: (typeof rows)[number]) => {
    const s = nestedSong(row.songs);
    return {
      id: row.id,
      song_id: row.song_id,
      position: row.position,
      version_id: row.version_id,
      song_title: s?.title ?? '',
      song_artist: s?.artist ?? '',
      original_key: s?.original_key ?? null,
    };
  });

  const { user_id: _u, ...rest } = setlist;
  return NextResponse.json({ setlist: rest, songs });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getApiUserId();
  if (!isAuthOk(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const patch: { name?: string; description?: string; is_public?: boolean } = {};

  if ('name' in b) {
    if (typeof b.name !== 'string') {
      return NextResponse.json({ error: 'name inválido' }, { status: 400 });
    }
    const name = b.name.trim();
    if (!name.length) {
      return NextResponse.json({ error: 'name no puede estar vacío' }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: 'name máximo 100 caracteres' }, { status: 400 });
    }
    patch.name = name;
  }

  if ('description' in b) {
    if (typeof b.description !== 'string') {
      return NextResponse.json({ error: 'description inválida' }, { status: 400 });
    }
    patch.description = b.description;
  }

  if ('is_public' in b) {
    if (typeof b.is_public !== 'boolean') {
      return NextResponse.json({ error: 'is_public inválido' }, { status: 400 });
    }
    patch.is_public = b.is_public;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: owned } = await supabase
    .from('setlists')
    .select('id')
    .eq('id', id)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (!owned) {
    return NextResponse.json({ error: 'Setlist no encontrada' }, { status: 404 });
  }

  const { error } = await supabase.from('setlists').update(patch).eq('id', id);
  if (error) {
    console.error('setlist PATCH:', error);
    return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getApiUserId();
  if (!isAuthOk(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: owned } = await supabase
    .from('setlists')
    .select('id')
    .eq('id', id)
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (!owned) {
    return NextResponse.json({ error: 'Setlist no encontrada' }, { status: 404 });
  }

  const { error } = await supabase.from('setlists').delete().eq('id', id);
  if (error) {
    console.error('setlist DELETE:', error);
    return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
