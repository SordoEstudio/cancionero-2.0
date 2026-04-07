import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getApiUserId, isAuthOk } from '@/lib/api/get-user-id';
import { isUuid } from '@/lib/validation/uuid';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

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

  const b = body as { name?: unknown; color?: unknown };
  const updates: Record<string, string> = {};

  if (b.name !== undefined) {
    const n = typeof b.name === 'string' ? b.name.trim() : '';
    if (!n || n.length > 50) {
      return NextResponse.json({ error: 'Nombre inválido (1–50 caracteres)' }, { status: 400 });
    }
    updates.name = n;
  }

  if (b.color !== undefined) {
    if (typeof b.color !== 'string' || !b.color.trim()) {
      return NextResponse.json({ error: 'color inválido' }, { status: 400 });
    }
    updates.color = b.color.trim();
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from('user_tags')
    .update(updates)
    .eq('id', id)
    .eq('user_id', auth.userId);

  if (error) {
    console.error('user_tags PATCH:', error);
    return NextResponse.json({ error: 'No se pudo actualizar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 });
  }

  const auth = await getApiUserId();
  if (!isAuthOk(auth)) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = createServiceClient();
  const { error } = await supabase.from('user_tags').delete().eq('id', id).eq('user_id', auth.userId);

  if (error) {
    console.error('user_tags DELETE:', error);
    return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
