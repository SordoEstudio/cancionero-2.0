import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getDemoUserId, isAuthDemoMode } from '@/lib/auth-demo';
import { SaveVersionSchema } from '@/lib/validation/schemas';

/** POST /api/save-version — guarda una versión personalizada de la canción */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = SaveVersionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Datos inválidos' },
      { status: 400 }
    );
  }

  const {
    songId,
    name,
    key,
    capo,
    transposeSteps,
    viewMode,
    scrollSpeed,
    hiddenTabs,
    notes,
    overrides,
  } = parsed.data;

  if (isAuthDemoMode()) {
    const demoId = getDemoUserId();
    if (!demoId) {
      return NextResponse.json({
        id: '00000000-0000-4000-8000-00000000d3d0',
        name,
        demo: true,
        persisted: false,
        message:
          'Modo demo sin DEMO_USER_ID: no se guardó en la base. Ejecutá pnpm demo:create-user y agregá el UUID a .env.local.',
      });
    }

    const supabase = createServiceClient();
    const { data: version, error: versionError } = await supabase
      .from('song_versions')
      .insert({
        song_id: songId,
        user_id: demoId,
        name,
        key,
        capo,
        transpose_steps: transposeSteps,
        view_mode: viewMode,
        scroll_speed: scrollSpeed,
        hidden_tabs: hiddenTabs,
        notes,
      })
      .select('id')
      .single();

    if (versionError || !version) {
      console.error('Error creando versión (demo):', versionError);
      return NextResponse.json(
        {
          error: 'Error al crear la versión. Verificá que DEMO_USER_ID exista en Authentication → Users.',
        },
        { status: 500 }
      );
    }

    if (overrides.length > 0) {
      const rows = overrides.map((o) => ({
        version_id: version.id,
        song_line_id: o.songLineId,
        chords: o.chords,
        text: o.text ?? null,
      }));

      const { error: overridesError } = await supabase.from('version_lines').insert(rows);
      if (overridesError) {
        console.error('Error guardando overrides (demo):', overridesError);
      }
    }

    return NextResponse.json({ id: version.id, name, demo: true, persisted: true });
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { data: version, error: versionError } = await supabase
    .from('song_versions')
    .insert({
      song_id: songId,
      user_id: user.id,
      name,
      key,
      capo,
      transpose_steps: transposeSteps,
      view_mode: viewMode,
      scroll_speed: scrollSpeed,
      hidden_tabs: hiddenTabs,
      notes,
    })
    .select('id')
    .single();

  if (versionError || !version) {
    console.error('Error creando versión:', versionError);
    return NextResponse.json({ error: 'Error al crear la versión' }, { status: 500 });
  }

  if (overrides.length > 0) {
    const rows = overrides.map((o) => ({
      version_id: version.id,
      song_line_id: o.songLineId,
      chords: o.chords,
      text: o.text ?? null,
    }));

    const { error: overridesError } = await supabase.from('version_lines').insert(rows);
    if (overridesError) {
      console.error('Error guardando overrides:', overridesError);
    }
  }

  return NextResponse.json({ id: version.id, name });
}
