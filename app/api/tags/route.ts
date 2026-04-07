import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getApiUserId, isAuthOk } from '@/lib/api/get-user-id';

const DEFAULT_TAG_COLOR = '#64748b';

export async function GET() {
  const auth = await getApiUserId();
  if (!isAuthOk(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('user_tags')
    .select('id, name, color')
    .eq('user_id', auth.userId)
    .order('name');

  if (error) {
    console.error('user_tags GET:', error);
    return NextResponse.json({ error: 'Error al obtener etiquetas' }, { status: 500 });
  }

  return NextResponse.json({ tags: data ?? [] });
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

  const nameRaw = (body as { name?: unknown }).name;
  const name = typeof nameRaw === 'string' ? nameRaw.trim() : '';
  if (!name || name.length > 50) {
    return NextResponse.json({ error: 'Nombre inválido (1–50 caracteres)' }, { status: 400 });
  }

  const colorRaw = (body as { color?: unknown }).color;
  const color =
    typeof colorRaw === 'string' && colorRaw.trim() ? colorRaw.trim() : DEFAULT_TAG_COLOR;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('user_tags')
    .insert({ user_id: auth.userId, name, color })
    .select('id, name, color')
    .single();

  if (error) {
    console.error('user_tags POST:', error);
    return NextResponse.json({ error: 'No se pudo crear la etiqueta' }, { status: 500 });
  }

  return NextResponse.json({ tag: data });
}
