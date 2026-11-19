import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

/** GET /api/keep-alive — cron diario para evitar que Supabase pause el proyecto */
export async function GET() {
  const supabase = createServiceClient();
  const { error } = await supabase.from('songs').select('id').limit(1);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ts: new Date().toISOString() });
}
