import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getApiUserId, isAuthOk } from '@/lib/api/get-user-id';

type SetlistRow = {
  id: string;
  name: string;
  description: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  setlist_songs: { count: number }[] | null;
};

export async function GET() {
  const auth = await getApiUserId();
  if (!isAuthOk(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('setlists')
    .select('id, name, description, is_public, created_at, updated_at, setlist_songs(count)')
    .eq('user_id', auth.userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('setlists GET:', error);
    return NextResponse.json({ error: 'No se pudo cargar' }, { status: 500 });
  }

  const rows = (data ?? []) as SetlistRow[];
  const setlists = rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    is_public: row.is_public,
    song_count: row.setlist_songs?.[0]?.count ?? 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return NextResponse.json({ setlists });
}

export async function POST(request: NextRequest) {
  const auth = await getApiUserId();
  if (!isAuthOk(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null || !('name' in body)) {
    return NextResponse.json({ error: 'Falta name' }, { status: 400 });
  }

  const nameRaw = (body as { name: unknown }).name;
  if (typeof nameRaw !== 'string') {
    return NextResponse.json({ error: 'name inválido' }, { status: 400 });
  }

  const name = nameRaw.trim();
  if (!name.length) {
    return NextResponse.json({ error: 'name no puede estar vacío' }, { status: 400 });
  }
  if (name.length > 100) {
    return NextResponse.json({ error: 'name máximo 100 caracteres' }, { status: 400 });
  }

  let description = '';
  if ('description' in body && body.description !== undefined) {
    if (typeof (body as { description: unknown }).description !== 'string') {
      return NextResponse.json({ error: 'description inválida' }, { status: 400 });
    }
    description = (body as { description: string }).description;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('setlists')
    .insert({
      user_id: auth.userId,
      name,
      description,
    })
    .select('id, name')
    .single();

  if (error) {
    console.error('setlists POST:', error);
    return NextResponse.json({ error: 'No se pudo crear' }, { status: 500 });
  }

  return NextResponse.json({ setlist: { id: data.id, name: data.name } });
}
