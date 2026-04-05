import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDemoUserId, isAuthDemoMode } from '@/lib/auth-demo';

/** GET /api/songs — historial de canciones importadas por el usuario autenticado */
export async function GET() {
  if (isAuthDemoMode()) {
    const supabase = await createClient();
    const demoId = getDemoUserId();

    let query = supabase
      .from('songs')
      .select('id, title, artist, source_url, original_key, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (demoId) {
      query = query.or(`imported_by.eq.${demoId},imported_by.is.null`);
    }

    const { data: songs, error } = await query;

    if (error) {
      console.error('Error obteniendo canciones (demo):', error);
      return NextResponse.json({ error: 'Error al obtener canciones' }, { status: 500 });
    }

    return NextResponse.json({ songs: songs ?? [], demo: true });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { data: songs, error } = await supabase
    .from('songs')
    .select('id, title, artist, source_url, original_key, created_at')
    .eq('imported_by', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error obteniendo canciones:', error);
    return NextResponse.json({ error: 'Error al obtener canciones' }, { status: 500 });
  }

  return NextResponse.json({ songs: songs ?? [] });
}
