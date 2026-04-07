import { z } from 'zod';

const lacuerdaOrCifraclubUrl = z
  .string()
  .url('URL invalida')
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
      .min(1, 'Pega el texto de la cifra')
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
  .regex(/^[A-G](#|b)?m?$/, 'Tonalidad invalida')
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

const hiddenTabsSchema = z.array(z.string().uuid()).default([]);
const notesSchema = z.string().max(5000).default('');

export const SaveVersionSchema = z.object({
  songId: z.string().uuid('ID de cancion invalido'),
  name: z.string().min(1, 'El nombre no puede estar vacio').max(100),
  key: keySnapshotSchema,
  capo: z.number().int().min(0).max(12),
  transposeSteps: z.number().int().min(-12).max(12).default(0),
  viewMode: VIEW_MODE_VALUES.default('default'),
  scrollSpeed: z.number().int().min(10).max(120).default(40),
  hiddenTabs: hiddenTabsSchema,
  notes: notesSchema,
  overrides: versionOverridesSchema,
});

export const UpdateVersionSchema = z.object({
  songId: z.string().uuid('ID de cancion invalido'),
  key: keySnapshotSchema,
  capo: z.number().int().min(0).max(12),
  transposeSteps: z.number().int().min(-12).max(12).default(0),
  viewMode: VIEW_MODE_VALUES.default('default'),
  scrollSpeed: z.number().int().min(10).max(120).default(40),
  hiddenTabs: hiddenTabsSchema,
  notes: notesSchema,
  overrides: versionOverridesSchema,
});

export const GetSongSchema = z.object({
  id: z.string().uuid('ID de cancion invalido'),
});
