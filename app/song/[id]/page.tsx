import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAppBaseUrl } from '@/lib/app-url';
import { SongEditor } from '@/components/song/SongEditor';
import type { FullSong, SongSectionWithLines, SongVersionActive, SetlistNavContext } from '@/types';

const VERSION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Evita que el worker de rutas cargue @supabase/ssr junto a generateMetadata (webpack "is not a function"). */
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: { v?: string; setlistId?: string; pos?: string };
}

async function fetchSongPayload(id: string, versionId: string | undefined, cookieHeader: string) {
  const qp = versionId ? `?v=${encodeURIComponent(versionId)}` : '';
  return fetch(`${getAppBaseUrl()}/api/song/${id}${qp}`, {
    cache: 'no-store',
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  });
}

async function fetchSetlistPayload(
  setlistId: string,
  cookieHeader: string
): Promise<{
  setlist: { name: string };
  songs: Array<{ song_id: string; version_id: string | null; position: number }>;
} | null> {
  try {
    const res = await fetch(`${getAppBaseUrl()}/api/setlists/${setlistId}`, {
      cache: 'no-store',
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
    });
    if (!res.ok) return null;
    return res.json().catch(() => null);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params, searchParams }: PageProps) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return { title: 'Canción no encontrada' };
  }
  const vRaw = searchParams?.v?.trim();
  const v = vRaw && VERSION_UUID_RE.test(vRaw) ? vRaw : undefined;
  const cookieStore = cookies();
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ');
  const res = await fetchSongPayload(id, v, cookieHeader);
  if (!res.ok) return { title: 'Canción no encontrada' };
  const payload = (await res.json()) as { song: { title: string; artist: string } };
  return { title: `${payload.song.title} — ${payload.song.artist} | Cancionero Pro` };
}

export default async function SongPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const vRaw = searchParams?.v?.trim();
  const v = vRaw && VERSION_UUID_RE.test(vRaw) ? vRaw : undefined;

  // Validar UUID básico
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const cookieStore = cookies();
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ');

  const setlistIdRaw = searchParams?.setlistId?.trim();
  const posRaw = searchParams?.pos;
  const setlistId = setlistIdRaw && VERSION_UUID_RE.test(setlistIdRaw) ? setlistIdRaw : undefined;
  const pos = posRaw !== undefined && /^\d+$/.test(posRaw) ? parseInt(posRaw, 10) : undefined;

  const [res, setlistPayload] = await Promise.all([
    fetchSongPayload(id, v, cookieHeader),
    setlistId && pos !== undefined ? fetchSetlistPayload(setlistId, cookieHeader) : Promise.resolve(null),
  ]);

  if (!res.ok) notFound();

  const payload = (await res.json()) as {
    song: FullSong;
    displaySections?: SongSectionWithLines[];
    activeVersion?: SongVersionActive;
  };

  let setlistContext: SetlistNavContext | undefined;
  if (setlistId && pos !== undefined && setlistPayload) {
    const sorted = [...setlistPayload.songs].sort((a, b) => a.position - b.position);
    const total = sorted.length;
    if (pos >= 0 && pos < total) {
      const prevEntry = pos > 0 ? sorted[pos - 1] : undefined;
      const nextEntry = pos < total - 1 ? sorted[pos + 1] : undefined;
      setlistContext = {
        setlistId,
        setlistName: setlistPayload.setlist.name,
        position: pos,
        total,
        prevSong: prevEntry ? { songId: prevEntry.song_id, versionId: prevEntry.version_id } : null,
        nextSong: nextEntry ? { songId: nextEntry.song_id, versionId: nextEntry.version_id } : null,
      };
    }
  }

  const variantKey = `${payload.song.id}:${payload.activeVersion?.id ?? 'base'}`;

  return (
    <SongEditor
      song={payload.song}
      displaySections={payload.displaySections}
      activeVersion={payload.activeVersion}
      variantKey={variantKey}
      setlistContext={setlistContext}
    />
  );
}
