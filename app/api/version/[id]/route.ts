import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getDemoUserId, isAuthDemoMode } from '@/lib/auth-demo';
import { UpdateVersionSchema } from '@/lib/validation/schemas';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** PATCH /api/version/:id — actualiza preferencias y overrides de una versión guardada */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: versionId } = await params;
  if (!UUID_RE.test(versionId)) {
    return NextResponse.json({ error: 'ID de versión inválido' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = UpdateVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Datos inválidos' },
      { status: 400 }
    );
  }

  const { songId, key, capo, transposeSteps, viewMode, scrollSpeed, overrides } =
    parsed.data;

  async function applyUpdate(client: SupabaseClient, userId: string) {
    const { data: row, error: selErr } = await client
      .from('song_versions')
      .select('id')
      .eq('id', versionId)
      .eq('song_id', songId)
      .eq('user_id', userId)
      .maybeSingle();

    if (selErr || !row) {
      return { ok: false as const, status: 404 as const, message: 'Versión no encontrada' };
    }

    const { error: upErr } = await client
      .from('song_versions')
      .update({
        key,
        capo,
        transpose_steps: transposeSteps,
        view_mode: viewMode,
        scroll_speed: scrollSpeed,
      })
      .eq('id', versionId);

    if (upErr) {
      console.error('Error actualizando versión:', upErr);
      return { ok: false as const, status: 500 as const, message: 'Error al actualizar la versión' };
    }

    const { error: delErr } = await client.from('version_lines').delete().eq('version_id', versionId);
    if (delErr) {
      console.error('Error borrando líneas de versión:', delErr);
      return { ok: false as const, status: 500 as const, message: 'Error al actualizar la cifra' };
    }

    if (overrides.length > 0) {
      const rows = overrides.map((o) => ({
        version_id: versionId,
        song_line_id: o.songLineId,
        chords: o.chords,
        text: o.text ?? null,
      }));
      const { error: insErr } = await client.from('version_lines').insert(rows);
      if (insErr) {
        console.error('Error insertando overrides:', insErr);
        return { ok: false as const, status: 500 as const, message: 'Error al guardar la cifra' };
      }
    }

    return { ok: true as const };
  }

  if (isAuthDemoMode()) {
    const demoId = getDemoUserId();
    if (!demoId) {
      return NextResponse.json({
        demo: true,
        persisted: false,
        message:
          'Modo demo sin DEMO_USER_ID: no se guardó. Configurá DEMO_USER_ID o iniciá sesión.',
      });
    }
    const admin = createServiceClient();
    const result = await applyUpdate(admin, demoId);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
    return NextResponse.json({ ok: true, demo: true, persisted: true });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const result = await applyUpdate(supabase, user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/version/:id — elimina la versión guardada (cascade en version_lines). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: versionId } = await params;
  if (!UUID_RE.test(versionId)) {
    return NextResponse.json({ error: 'ID de versión inválido' }, { status: 400 });
  }

  async function applyDelete(client: SupabaseClient, userId: string) {
    const { data: row, error: selErr } = await client
      .from('song_versions')
      .select('id')
      .eq('id', versionId)
      .eq('user_id', userId)
      .maybeSingle();

    if (selErr || !row) {
      return { ok: false as const, status: 404 as const, message: 'Versión no encontrada' };
    }

    const { error: delErr } = await client.from('song_versions').delete().eq('id', versionId);
    if (delErr) {
      console.error('Error borrando versión:', delErr);
      return { ok: false as const, status: 500 as const, message: 'No se pudo eliminar' };
    }

    return { ok: true as const };
  }

  if (isAuthDemoMode()) {
    const demoId = getDemoUserId();
    if (!demoId) {
      return NextResponse.json({ error: 'Demo sin DEMO_USER_ID' }, { status: 403 });
    }
    const admin = createServiceClient();
    const result = await applyDelete(admin, demoId);
    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
    return NextResponse.json({ ok: true, demo: true });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const result = await applyDelete(supabase, user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
