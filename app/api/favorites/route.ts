import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getApiUserId, isAuthOk } from '@/lib/api/get-user-id';

export async function GET() {
  const auth = await getApiUserId();
  if (!isAuthOk(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('user_favorites')
    .select('song_id')
    .eq('user_id', auth.userId);

  if (error) {
    console.error('user_favorites GET:', error);
    return NextResponse.json({ error: 'Error al obtener favoritos' }, { status: 500 });
  }

  const favorites = (data ?? []).map((r) => r.song_id as string);
  return NextResponse.json({ favorites });
}
