import { z } from 'zod';

const lacuerdaOrCifraclubUrl = z
  .string()
  .url('URL inválida')
  .refine(
    (url) => {
      try {
        const host = new URL(url).hostname.toLowerCase();
        return host.includes('lacuerda.net') || host.includes('cifraclub.com');
      } catch {
        return false;
      }
    },
    { message: 'URL debe ser de lacuerda.net o cifraclub.com' }
  );

export const ImportSongSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('url'),
    url: lacuerdaOrCifraclubUrl,
  }),
  z.object({
    mode: z.literal('paste'),
    text: z
      .string()
      .trim()
      .min(1, 'Pegá el texto de la cifra')
      .max(200_000, 'El texto es demasiado largo'),
    title: z.string().trim().max(200).optional(),
    artist: z.string().trim().max(200).optional(),
  }),
]);

const VIEW_MODE_VALUES = z.enum([
  'default',
  'inline',
  'chords-only',
  'lyrics-only',
]);

const keySnapshotSchema = z
  .string()
  .regex(/^[A-G](#|b)?m?$/, 'Tonalidad inválida')
  .nullable();

const versionOverridesSchema = z.array(
  z.object({
    songLineId: z.string().uuid(),
    chords: z.array(
      z.object({
        position: z.number().int().min(0),
        chord: z.string().min(1).max(12),
      })
    ),
    text: z.string().optional(),
  })
);

export const SaveVersionSchema = z.object({
  songId: z.string().uuid('ID de canción inválido'),
  name: z.string().min(1, 'El nombre no puede estar vacío').max(100),
  /** Tono de interpretación (denormalizado para listas); puede ser null sin tonalidad en la canción. */
  key: keySnapshotSchema,
  capo: z.number().int().min(0).max(12),
  transposeSteps: z.number().int().min(-12).max(12).default(0),
  viewMode: VIEW_MODE_VALUES.default('default'),
  scrollSpeed: z.number().int().min(10).max(120).default(40),
  overrides: versionOverridesSchema,
});

/** PATCH versión existente (misma fila song_versions + reemplazo de version_lines). */
export const UpdateVersionSchema = z.object({
  songId: z.string().uuid('ID de canción inválido'),
  key: keySnapshotSchema,
  capo: z.number().int().min(0).max(12),
  transposeSteps: z.number().int().min(-12).max(12).default(0),
  viewMode: VIEW_MODE_VALUES.default('default'),
  scrollSpeed: z.number().int().min(10).max(120).default(40),
  overrides: versionOverridesSchema,
});

export const GetSongSchema = z.object({
  id: z.string().uuid('ID de canción inválido'),
});
