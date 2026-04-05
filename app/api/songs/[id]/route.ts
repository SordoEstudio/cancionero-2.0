import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getDemoUserId, isAuthDemoMode } from '@/lib/auth-demo';
import { GetSongSchema } from '@/lib/validation/schemas';

/** DELETE /api/songs/:id — elimina la canción si sos el importador (cascade en DB). */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const validation = GetSongSchema.safeParse({ id });
  if (!validation.success) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  if (isAuthDemoMode()) {
    const demoId = getDemoUserId();
    if (!demoId) {
      return NextResponse.json({ error: 'Demo sin DEMO_USER_ID' }, { status: 403 });
    }
    const admin = createServiceClient();
    const { data: row } = await admin
      .from('songs')
      .select('id, imported_by')
      .eq('id', id)
      .maybeSingle();

    if (!row || row.imported_by !== demoId) {
      return NextResponse.json({ error: 'Canción no encontrada' }, { status: 404 });
    }

    const { error } = await admin.from('songs').delete().eq('id', id);
    if (error) {
      console.error('Error borrando canción (demo):', error);
      return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { data: row } = await supabase
    .from('songs')
    .select('id')
    .eq('id', id)
    .eq('imported_by', user.id)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: 'Canción no encontrada' }, { status: 404 });
  }

  const { error } = await supabase.from('songs').delete().eq('id', id);
  if (error) {
    console.error('Error borrando canción:', error);
    return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
