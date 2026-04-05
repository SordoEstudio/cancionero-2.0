import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAppBaseUrl } from '@/lib/app-url';
import { createClient } from '@/lib/supabase/server';
import { SongEditor } from '@/components/song/SongEditor';
import type { FullSong, SongSectionWithLines, SongVersionActive } from '@/types';

const VERSION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: { v?: string };
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from('songs')
    .select('title, artist')
    .eq('id', id)
    .single();

  if (!data) return { title: 'Canción no encontrada' };
  return { title: `${data.title} — ${data.artist} | Cancionero Pro` };
}

export default async function SongPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const vRaw = searchParams?.v?.trim();
  const v = vRaw && VERSION_UUID_RE.test(vRaw) ? vRaw : undefined;

  // Validar UUID básico
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const qp = v ? `?v=${encodeURIComponent(v)}` : '';
  const res = await fetch(`${getAppBaseUrl()}/api/song/${id}${qp}`, {
    cache: 'no-store',
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  });

  if (!res.ok) notFound();

  const payload = (await res.json()) as {
    song: FullSong;
    displaySections?: SongSectionWithLines[];
    activeVersion?: SongVersionActive;
  };

  const variantKey = `${payload.song.id}:${payload.activeVersion?.id ?? 'base'}`;

  return (
    <SongEditor
      song={payload.song}
      displaySections={payload.displaySections}
      activeVersion={payload.activeVersion}
      variantKey={variantKey}
    />
  );
}
