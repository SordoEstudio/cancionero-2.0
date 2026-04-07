import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getApiUserId, isAuthOk } from '@/lib/api/get-user-id';
import { isUuid } from '@/lib/validation/uuid';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ songId: string }> }
) {
  const { songId } = await params;
  if (!isUuid(songId)) {
    return NextResponse.json({ error: 'songId inválido' }, { status: 400 });
  }

  const auth = await getApiUserId();
  if (!isAuthOk(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createServiceClient();
  const { error } = await supabase.from('user_favorites').upsert(
    { user_id: auth.userId, song_id: songId },
    { onConflict: 'user_id,song_id' }
  );

  if (error) {
    console.error('user_favorites POST:', error);
    return NextResponse.json({ error: 'No se pudo guardar el favorito' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ songId: string }> }
) {
  const { songId } = await params;
  if (!isUuid(songId)) {
    return NextResponse.json({ error: 'songId inválido' }, { status: 400 });
  }

  const auth = await getApiUserId();
  if (!isAuthOk(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('user_favorites')
    .delete()
    .eq('user_id', auth.userId)
    .eq('song_id', songId);

  if (error) {
    console.error('user_favorites DELETE:', error);
    return NextResponse.json({ error: 'No se pudo quitar el favorito' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
