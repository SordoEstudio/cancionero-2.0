import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getDemoUserId, isAuthDemoMode } from '@/lib/auth-demo';
import type { SavedVersionListItem } from '@/types';

function songFromJoin(songs: unknown): { title: string; artist: string } | null {
  if (!songs) return null;
  if (Array.isArray(songs)) {
    const first = songs[0] as { title?: string; artist?: string } | undefined;
    return first ? { title: first.title ?? '', artist: first.artist ?? '' } : null;
  }
  const o = songs as { title?: string; artist?: string };
  return { title: o.title ?? '', artist: o.artist ?? '' };
}

function mapRows(rows: unknown): SavedVersionListItem[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const r = row as {
      id: string;
      name: string;
      key: string | null;
      capo: number;
      created_at: string;
      song_id: string;
      songs: unknown;
    };
    const s = songFromJoin(r.songs);
    return {
      id: r.id,
      name: r.name,
      key: r.key,
      capo: r.capo,
      created_at: r.created_at,
      song_id: r.song_id,
      song_title: s?.title ?? '',
      song_artist: s?.artist ?? '',
    };
  });
}

/** GET /api/versions — versiones guardadas del usuario (con título de canción) */
export async function GET() {
  if (isAuthDemoMode()) {
    const demoId = getDemoUserId();
    if (!demoId) {
      return NextResponse.json({
        versions: [] as SavedVersionListItem[],
        demo: true,
        message:
          'Sin DEMO_USER_ID no hay versiones en lista. Configurá el UUID de demo o iniciá sesión en producción.',
      });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('song_versions')
      .select('id, name, key, capo, created_at, song_id, songs(title, artist)')
      .eq('user_id', demoId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error obteniendo versiones (demo):', error);
      return NextResponse.json({ error: 'Error al obtener versiones' }, { status: 500 });
    }

    return NextResponse.json({ versions: mapRows(data), demo: true });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('song_versions')
    .select('id, name, key, capo, created_at, song_id, songs(title, artist)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error obteniendo versiones:', error);
    return NextResponse.json({ error: 'Error al obtener versiones' }, { status: 500 });
  }

  return NextResponse.json({ versions: mapRows(data) });
}
