/**
 * Gemini como analizador estructural completo: toma texto crudo pegado por el
 * usuario y devuelve la canción completamente estructurada con secciones
 * tipadas, acordes posicionados, tablaturas preservadas y metadata.
 *
 * Dos modos de salida:
 *   - cleanedContent: texto con etiquetas [Verso], [Coro]... (fallback para parser)
 *   - sections: array estructurado de secciones (preferido, bypasea el parser)
 */

import type { ParsedSong, ParsedSection, ParsedLine, SectionType } from '@/types';
import { extractChordsFromLine, isChordLine } from '@/lib/parser/chord-detector';

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sos un experto en cifrado musical, análisis armónico y estructura de canciones.
Tu tarea es tomar texto crudo pegado por un usuario (copiado de sitios como LaCuerda, CifraClub, o escrito a mano) y devolver la canción COMPLETAMENTE ESTRUCTURADA.

═══════════════ RUIDO A ELIMINAR ═══════════════

ELIMINÁ estas líneas por completo:
- Cabeceras de sitios web: puntuaciones, menús, links, "Mostrar/Ocultar", "Desfile Automático", "Diagramas de Acordes", "Cambio de Tono", "Cifrado Inglés/Latino", "Formato del Texto"
- Metadata de sitio: "enviado por X", "corregir", "desconocido", códigos como "spin0021"
- Comentarios del usuario: líneas con *, dedicatorias, opiniones ("Bueno así es creo yo..."), explicaciones ("escuchar la canción", "correcciones bienvenidas", "es mi versión")
- Instrucciones de ejecución: "rasgueo: abajo-arriba", "usar cejilla en traste 2", "suena mejor con capo 2"
- Repeticiones abreviadas: "x2", "repite coro", "igual que verso 1"
- Frases introductorias: "Aca va una transcripción de...", "Esta es mi versión de...", "Les dejo los acordes de..."
- Emojis, URLs, spam, firmas
- Cualquier texto que NO sea letra de la canción, acordes, etiquetas de sección, o tablatura

═══════════════ TABLATURAS ═══════════════

Las tablaturas ASCII son contenido musical VALIOSO. Preservalas EXACTAMENTE.
Detección: líneas tipo e|---0---, B|---1---, o patrones de guiones con números en 6 cuerdas (e/B/G/D/A/E).
Marcalas como secciones separadas de tipo "tab".

═══════════════ DETECCIÓN DE ESTRUCTURA ═══════════════

Analizá la FORMA MUSICAL usando estas reglas:

TIPOS DE SECCIÓN:
- intro: solo acordes al inicio (sin letra), o tablatura introductoria
- verse: presenta la narrativa, progresión armónica base, letra cambia entre repeticiones
- prechorus: sección corta que conecta verso con coro, armonía de transición
- chorus: se repite con misma melodía/armonía, generalmente la parte más memorable
- bridge: armonía DIFERENTE a verso y coro, aparece generalmente una sola vez
- solo: sección instrumental en medio de la canción (no intro ni outro)
- outro: cierre de la canción, puede ser instrumental o con letra
- tab: tablatura ASCII

REGLAS DE DETECCIÓN:
1. Si dos bloques tienen la MISMA progresión armónica pero DIFERENTE letra → son el mismo tipo (ambos "verse" o ambos "chorus")
2. Si un bloque se repite con MISMA letra Y MISMOS acordes → "chorus" (el coro se repite idéntico)
3. El segundo bloque armónico distinto después del verso suele ser "chorus" (patrón verso→coro)
4. Un bloque con armonía que no aparece en versos ni coros → "bridge"
5. Líneas solo de acordes al inicio → "intro"
6. Líneas solo de acordes al final → "outro"
7. Si una sección aparece sin acordes pero con letra que rima/sigue el patrón → repetición del tipo anterior

SECCIONES PEGADAS SIN SEPARACIÓN (MUY IMPORTANTE):
Muchos textos de canciones NO tienen líneas en blanco entre secciones. Detectá los cambios de sección DENTRO de un bloque continuo usando estos criterios:
- CAMBIO DE PROGRESIÓN ARMÓNICA: si ya estableciste que el verso usa (ej: E F#m C#m D#dim B) y el coro usa (ej: C#m G#m B), cuando dentro de un bloque continuo la progresión cambia de una a otra → CORTÁ ahí y creá una sección nueva.
- PATRÓN ARMÓNICO RECONOCIDO: si una línea de acordes coincide con una progresión ya vista en verso o coro anterior → esa línea inicia una repetición de esa sección.
- No dependas de líneas en blanco para separar secciones. Las líneas en blanco son una PISTA, pero NO un requisito. La armonía es la guía principal.

REPETICIONES IMPLÍCITAS:
Si hay letra sin acordes que repite la estructura de un verso/coro anterior, DEDUCÍ los acordes y ESCRIBÍ la sección completa. Nunca dejes secciones sin acordes si ya sabés cuáles son.

═══════════════ ACORDES ═══════════════

Notación anglosajona: C, C#, Db, Dm, G7, Bbm, Cmaj7, D(add9), Asus4, Bm7b5, C#m/D#, etc.
Preservá la notación ORIGINAL de los acordes del input.
Si hay acordes inline como "[Am]hola [F]mundo" o "(Am)hola (F)mundo", convertí al formato estándar (línea de acordes arriba, línea de letra abajo).

EDGE CASES de acordes:
- Slash chords: C/G, D/F#, A/E → preservar tal cual
- Acordes con paréntesis: G (C) G → tratar como progresión G C G
- Acordes repetidos sin letra entre bloques → sección instrumental
- Acordes al final de una línea de letra → mover a la línea de acordes arriba

═══════════════ TONALIDAD ═══════════════

Analizá las funciones armónicas:
- I, IV, V, vi son las funciones más comunes en música popular
- Cadencia V→I confirma la tonalidad
- El acorde de resolución (donde "descansa" la frase) suele ser el I
- NO uses solo frecuencia de aparición
- Si la canción usa mayormente acordes menores con resolución en menor → tonalidad menor (ej: Am, Em)

═══════════════ FORMATO DE SALIDA ═══════════════

Respondé ÚNICAMENTE con JSON válido:

{
  "title": "título detectado o vacío si no se detecta",
  "artist": "artista detectado o vacío",
  "originalKey": "tonalidad (ej: E, Am, Bb) o null",
  "capo": number o null si se menciona,
  "sections": [
    {
      "type": "verse|chorus|bridge|intro|outro|solo|prechorus|tab",
      "label": "Verso 1|Coro|Puente|Tab: Intro|etc.",
      "lines": [
        {
          "chords": "C#m       G#m    B          C#m",
          "lyrics": "bajan, el día es vidrio sin sol"
        }
      ],
      "tablature": "e|---0---\\nB|---1---" (solo para type=tab, null para otros)
    }
  ]
}

REGLAS del JSON:
- "lines": cada objeto tiene "chords" (string con acordes posicionados, puede ser "" si no hay) y "lyrics" (string, puede ser "" para líneas instrumentales)
- Para tablaturas: usá "tablature" (string con \\n entre cuerdas) y lines=[]
- "label": etiqueta descriptiva en español. Numerar si se repite el tipo: "Verso 1", "Verso 2", "Coro", "Coro"
- Secciones separadas incluso si no hay etiqueta explícita en el input — TU tarea es inferir la estructura

══════════════════ EJEMPLOS ══════════════════

EJEMPLO — Canción con tablatura, ruido y repetición implícita:

INPUT:
8.17/10 (95)Luis Alberto Spinetta  corregir
Enviado por Imanol
Mostrar/Ocultar Menú
Aca va una transcripción de Bajan del disco Artaud con la intro:

 e----0---0-------0---0-------0---0-------0---0--------
 B-----0-2---------0-2---------0-2---------0-2---------
 G------1-----------1-----------1-----------1----------
 D-----------------------------------------------------
 A-----------------------------------------------------
 E-0---------3-0---------3-0---------3-0---------3-0---

 E            F#m
  Tengo tiempo   para saber
C#m           D#dim    B
   si lo que sueño concluye en algo

C#m       G#m    B          C#m
bajan, el día es vidrio sin sol

Viejo roble del camino,
tus hojas siempre se agitan algo
bajan, el día se sienta a morir

*Bueno así es creo yo

OUTPUT:
{
  "title": "Bajan",
  "artist": "Luis Alberto Spinetta",
  "originalKey": "E",
  "capo": null,
  "sections": [
    {
      "type": "tab",
      "label": "Tab: Intro",
      "lines": [],
      "tablature": " e----0---0-------0---0-------0---0-------0---0--------\\n B-----0-2---------0-2---------0-2---------0-2---------\\n G------1-----------1-----------1-----------1----------\\n D-----------------------------------------------------\\n A-----------------------------------------------------\\n E-0---------3-0---------3-0---------3-0---------3-0---"
    },
    {
      "type": "verse",
      "label": "Verso 1",
      "lines": [
        {"chords": " E            F#m", "lyrics": "  Tengo tiempo   para saber"},
        {"chords": "C#m           D#dim    B", "lyrics": "   si lo que sueño concluye en algo"}
      ],
      "tablature": null
    },
    {
      "type": "chorus",
      "label": "Coro",
      "lines": [
        {"chords": "C#m       G#m    B          C#m", "lyrics": "bajan, el día es vidrio sin sol"}
      ],
      "tablature": null
    },
    {
      "type": "verse",
      "label": "Verso 2",
      "lines": [
        {"chords": " E            F#m", "lyrics": "Viejo roble del camino,"},
        {"chords": "C#m           D#dim    B", "lyrics": "tus hojas siempre se agitan algo"}
      ],
      "tablature": null
    },
    {
      "type": "chorus",
      "label": "Coro",
      "lines": [
        {"chords": "C#m       G#m    B          C#m", "lyrics": "bajan, el día se sienta a morir"}
      ],
      "tablature": null
    }
  ]
}

Notas: el ruido (rating, "Enviado por", "Mostrar/Ocultar", intro del usuario, comentario *) fue eliminado. La tablatura se preservó. El verso 2 sin acordes dedujo los del verso 1. El coro se repite con diferente letra pero mismos acordes. Tonalidad E (I=E, ii=F#m, V=B, vi=C#m).

EJEMPLO 2 — Letra sin acordes, repetición implícita y verso+coro pegados:

INPUT:
 E            F#m
  Tengo tiempo   para saber

C#m           D#dim    B
   si lo que sueño concluye en algo

E            F#m
 No te apures   ya más loco

C#m             D#dim     B
   porque es entonces cuando las horas


C#m       G#m    B          C#m
bajan, el día es vidrio sin sol

          G#m         B Cm    C#m
Bajan, la noche te ocul-ta la voz

     C   C   Am7 G#7 F#m7
Y además vos que-rés Sol

    C#m        D#m                 C#m - C#m/D# - C#m/E - Amaj7
Despacio también podés hallar la luna


Viejo roble del camino,
tus hojas siempre se agitan algo
Nena, nena, que bien te ves
Cuando en tus ojos no importa si las horas
bajan, el día se sienta a morir
Bajan, la noche se nubla sin fin
Y además vos sos el Sol
Despacio también podes ser la luna.

OUTPUT:
{
  "title": "Bajan",
  "artist": "Luis Alberto Spinetta",
  "originalKey": "E",
  "capo": null,
  "sections": [
    {
      "type": "verse",
      "label": "Verso 1",
      "lines": [
        {"chords": " E            F#m", "lyrics": "  Tengo tiempo   para saber"},
        {"chords": "C#m           D#dim    B", "lyrics": "   si lo que sueño concluye en algo"},
        {"chords": "E            F#m", "lyrics": " No te apures   ya más loco"},
        {"chords": "C#m             D#dim     B", "lyrics": "   porque es entonces cuando las horas"}
      ],
      "tablature": null
    },
    {
      "type": "chorus",
      "label": "Coro",
      "lines": [
        {"chords": "C#m       G#m    B          C#m", "lyrics": "bajan, el día es vidrio sin sol"},
        {"chords": "          G#m         B Cm    C#m", "lyrics": "Bajan, la noche te ocul-ta la voz"},
        {"chords": "     C   C   Am7 G#7 F#m7", "lyrics": "Y además vos que-rés Sol"},
        {"chords": "    C#m        D#m                 C#m   C#m/D#   C#m/E   Amaj7", "lyrics": "Despacio también podés hallar la luna"}
      ],
      "tablature": null
    },
    {
      "type": "verse",
      "label": "Verso 2",
      "lines": [
        {"chords": " E            F#m", "lyrics": "Viejo roble del camino,"},
        {"chords": "C#m           D#dim    B", "lyrics": "tus hojas siempre se agitan algo"},
        {"chords": "E            F#m", "lyrics": "Nena, nena, que bien te ves"},
        {"chords": "C#m             D#dim     B", "lyrics": "Cuando en tus ojos no importa si las horas"}
      ],
      "tablature": null
    },
    {
      "type": "chorus",
      "label": "Coro",
      "lines": [
        {"chords": "C#m       G#m    B          C#m", "lyrics": "bajan, el día se sienta a morir"},
        {"chords": "          G#m         B Cm    C#m", "lyrics": "Bajan, la noche se nubla sin fin"},
        {"chords": "     C   C   Am7 G#7 F#m7", "lyrics": "Y además vos sos el Sol"},
        {"chords": "    C#m        D#m                 C#m   C#m/D#   C#m/E   Amaj7", "lyrics": "Despacio también podes ser la luna."}
      ],
      "tablature": null
    }
  ]
}

Notas sobre este ejemplo CRÍTICO — tres patrones combinados:
1. PARES ACORDE-LETRA SEPARADOS POR BLANK LINES: El verso 1 y coro tienen líneas en blanco entre cada par acorde+letra. Las blank lines NO significan cambio de sección — solo separan pares. La sección cambia cuando la PROGRESIÓN ARMÓNICA cambia.
2. SEPARACIÓN VERSO→CORO POR ARMONÍA: el verso usa E, F#m, C#m, D#dim, B. El coro usa C#m, G#m, B, Cm, C, Am7, G#7, F#m7, D#m. El corte se hace donde cambia la progresión armónica.
3. BLOQUE DE PURA LETRA SIN ACORDES (el desafío principal):
   - "Viejo roble del camino..." hasta "Despacio también podes ser la luna." es TODO texto sin acordes.
   - PERO contiene tanto el Verso 2 como el Coro 2 pegados.
   - ¿Cómo sabemos dónde cortar? Por la ESTRUCTURA PARALELA con las secciones anteriores:
     * Las primeras 4 líneas ("Viejo roble...hasta...las horas") siguen el patrón narrativo del verso 1 → son Verso 2
     * Las últimas 4 líneas ("bajan...hasta...la luna") repiten el patrón del coro ("bajan" = palabra clave del estribillo, "Y además vos" = frase recurrente) → son Coro 2
   - Los ACORDES se deducen de las secciones equivalentes anteriores (Verso 1 → Verso 2, Coro 1 → Coro 2)
4. ACORDES CON GUIONES: "C#m - C#m/D# - C#m/E - Amaj7" → los guiones son separadores visuales, preservar solo los acordes: "C#m   C#m/D#   C#m/E   Amaj7"`;

// ─────────────────────────────────────────────────────────────────────────────
// Types & converter
// ─────────────────────────────────────────────────────────────────────────────

interface GeminiSection {
  type: string;
  label: string;
  lines: { chords: string; lyrics: string }[];
  tablature: string | null;
}

interface GeminiStructuredResult {
  title: string;
  artist: string;
  originalKey: string | null;
  capo: number | null;
  sections: GeminiSection[];
}

export interface GeminiCleanResult {
  title: string;
  artist: string;
  originalKey: string | null;
  cleanedContent: string;
}

const VALID_TYPES: Record<string, SectionType> = {
  intro: 'intro',
  verse: 'verse',
  prechorus: 'pre-chorus',
  'pre-chorus': 'pre-chorus',
  chorus: 'chorus',
  bridge: 'bridge',
  solo: 'solo',
  outro: 'outro',
  tab: 'tab',
  instrumental: 'intro',
};

function normalizeSectionType(raw: string): SectionType {
  return VALID_TYPES[raw.toLowerCase().trim()] ?? 'unknown';
}

/** "E Major" → "E", "A minor" → "Am", "Bb Mayor" → "Bb", "F# Minor" → "F#m" */
function normalizeKey(raw: string): string {
  const s = raw.trim();
  const m = s.match(/^([A-G][#b]?)\s*(major|mayor|maj)?$/i);
  if (m) return m[1];
  const mi = s.match(/^([A-G][#b]?)\s*(minor|menor|min|m)$/i);
  if (mi) return mi[1] + 'm';
  return s;
}

/**
 * Convierte la línea de acordes (string con posiciones) + lyrics en ParsedLine.
 */
function geminiLineToParsedLine(chords: string, lyrics: string): ParsedLine {
  if (chords && chords.trim().length > 0 && isChordLine(chords)) {
    return {
      chords: extractChordsFromLine(chords),
      text: lyrics || '',
    };
  }
  return { chords: [], text: lyrics || '' };
}

/**
 * Convierte el resultado estructurado de Gemini en ParsedSong.
 * Bypasea completamente el parser heurístico.
 */
export function geminiResultToParsedSong(
  result: GeminiStructuredResult,
  sourceUrl: string
): ParsedSong {
  const sections: ParsedSection[] = result.sections.map((sec) => {
    const type = normalizeSectionType(sec.type);

    if (type === 'tab' && sec.tablature) {
      const tabLines = sec.tablature.split('\n').map((l) => ({
        chords: [] as ParsedLine['chords'],
        text: l,
      }));
      return { type, label: sec.label || 'Tablatura', lines: tabLines };
    }

    const lines: ParsedLine[] = sec.lines.map((l) =>
      geminiLineToParsedLine(l.chords, l.lyrics)
    );

    return { type, label: sec.label || type, lines };
  });

  return {
    title: result.title || '',
    artist: result.artist || '',
    sourceUrl,
    originalKey: result.originalKey,
    sections,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// API call
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Llama a Gemini y devuelve el resultado estructurado.
 * Si Gemini devuelve el formato nuevo con sections, lo usa directamente.
 * Si devuelve el formato viejo con cleanedContent, lo devuelve como fallback.
 */
export async function analyzeWithGemini(
  rawText: string,
  hintTitle: string,
  hintArtist: string
): Promise<
  | { mode: 'structured'; data: GeminiStructuredResult }
  | { mode: 'cleaned'; data: GeminiCleanResult }
> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada');
  }

  const userPrompt = [
    hintTitle ? `Título sugerido: "${hintTitle}"` : '',
    hintArtist ? `Artista sugerido: "${hintArtist}"` : '',
    '',
    'Texto crudo:',
    rawText,
  ]
    .filter(Boolean)
    .join('\n');

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 32768,
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('Gemini API error:', res.status, errBody);
    throw new Error(`Gemini API respondió con ${res.status}`);
  }

  const data = await res.json();
  const textContent: string | undefined =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!textContent) {
    throw new Error('Gemini no devolvió contenido');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(textContent);
  } catch {
    throw new Error('Gemini devolvió JSON inválido');
  }

  const rawKey =
    typeof parsed.originalKey === 'string' && parsed.originalKey.trim().length > 0
      ? normalizeKey(parsed.originalKey)
      : null;

  const title =
    typeof parsed.title === 'string' && parsed.title.trim().length > 0
      ? parsed.title.trim()
      : hintTitle;

  const artist =
    typeof parsed.artist === 'string' && parsed.artist.trim().length > 0
      ? parsed.artist.trim()
      : hintArtist;

  // Prefer structured sections output
  if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
    return {
      mode: 'structured',
      data: {
        title,
        artist,
        originalKey: rawKey,
        capo: typeof parsed.capo === 'number' ? parsed.capo : null,
        sections: parsed.sections as GeminiSection[],
      },
    };
  }

  // Fallback to cleanedContent format
  const cleaned =
    typeof parsed.cleanedContent === 'string' ? parsed.cleanedContent : '';
  if (cleaned.trim().length === 0) {
    throw new Error('Gemini no devolvió contenido estructurado ni texto limpio');
  }

  return {
    mode: 'cleaned',
    data: { title, artist, originalKey: rawKey, cleanedContent: cleaned },
  };
}

/** Backward-compatible wrapper */
export async function cleanWithGemini(
  rawText: string,
  hintTitle: string,
  hintArtist: string
): Promise<GeminiCleanResult> {
  const result = await analyzeWithGemini(rawText, hintTitle, hintArtist);
  if (result.mode === 'cleaned') return result.data;

  // Convert structured to cleanedContent for backward compat
  const lines: string[] = [];
  for (const sec of result.data.sections) {
    const label = sec.label || sec.type;
    lines.push(`[${label}]`);
    if (sec.tablature) {
      lines.push(sec.tablature);
    } else {
      for (const l of sec.lines) {
        if (l.chords) lines.push(l.chords);
        if (l.lyrics) lines.push(l.lyrics);
      }
    }
    lines.push('');
  }

  return {
    title: result.data.title,
    artist: result.data.artist,
    originalKey: result.data.originalKey,
    cleanedContent: lines.join('\n').trim(),
  };
}
