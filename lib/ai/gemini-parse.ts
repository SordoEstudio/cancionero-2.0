/**
 * Gemini: parser determinista en texto ([secciones], acordes sobre letra, [TAB]…[/TAB]).
 * `parseSong` convierte ese texto en ParsedSong.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** Error HTTP de la API de Google Generative Language (clave, permisos, cuota, etc.). */
export class GeminiApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly details: unknown
  ) {
    super(message);
    this.name = 'GeminiApiError';
  }
}

function parseGoogleApiErrorBody(bodyText: string): { message: string; parsed: unknown } {
  const trimmed = bodyText.trim();
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: { message?: string; status?: string; code?: number };
    };
    const msg = parsed?.error?.message;
    if (typeof msg === 'string' && msg.length > 0) {
      return { message: msg, parsed };
    }
  } catch {
    /* ignore */
  }
  return {
    message: trimmed.length > 0 ? trimmed.slice(0, 800) : 'Sin cuerpo de error',
    parsed: trimmed,
  };
}

/** Código HTTP a devolver al cliente (evita 503 genérico cuando Google dice 403/429…). */
export function httpStatusForGeminiError(httpStatus: number): number {
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429) return httpStatus;
  if (httpStatus >= 400 && httpStatus < 500) return httpStatus;
  return 502;
}

function geminiDebugEnabled(): boolean {
  const v = process.env.GEMINI_DEBUG?.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function logGeminiApiMeta(data: unknown): void {
  if (!geminiDebugEnabled()) return;
  const d = data as {
    candidates?: Array<{ finishReason?: string; safetyRatings?: unknown }>;
    usageMetadata?: unknown;
    promptFeedback?: unknown;
  };
  const c0 = d?.candidates?.[0];
  // eslint-disable-next-line no-console
  console.log('[Gemini debug] API meta:', {
    finishReason: c0?.finishReason,
    usageMetadata: d?.usageMetadata,
    promptFeedback: d?.promptFeedback,
  });
}

function logGeminiTextOutput(text: string, inputChars: number): void {
  if (!geminiDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.log('[Gemini debug] salida texto (chars):', text.length, '| input:', inputChars);
  // eslint-disable-next-line no-console
  console.log('[Gemini debug] preview:\n', text.slice(0, 1200) + (text.length > 1200 ? '\n…' : ''));
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Actúa como un parser determinista de canciones con acordes.

OBJETIVO
Convertir texto de canciones en formato limpio manteniendo:

- estructura musical
- acordes alineados con la letra
- repetición correcta de progresiones
- eliminación de texto no musical

PRINCIPIO CLAVE
Si una sección tiene letra sin acordes, asumir que utiliza la progresión armónica más reciente compatible.

DEFINICIONES

ACORDE válido:
A–G con modificadores opcionales:

#
b
m
maj
dim
aug
sus
add
2 4 5 6 7 9 11 13

ej:
C
Am
F#
G#m7
Bb
Amaj7
D#dim
C/G

SECCIONES válidas:

[Intro]
[Verso]
[Coro]
[Puente]
[Solo]
[Instrumental]
[Outro]

normalizar:

Estribillo → Coro
Refrão → Coro

REGLAS DE PARSEO

1. detectar progresiones iniciales

ej:
Intro: D-A-G-D x2

→ guardar progresión base:
D A G D

2. asignación de acordes

si una línea de acordes está encima de una línea de letra:
asignar normalmente

ej:

D A
texto

3. herencia armónica

si aparece letra sin acordes:

usar progresión previa si:

- el texto indica repetición
- la estructura coincide con un verso previo
- aparece texto tipo:

repite lo mismo
mismos acordes
igual que arriba
bis
x2
repite estrofa

4. comentarios no musicales

eliminar líneas que contengan:

tono:
capo:
repite:
notas:
acordes:
intro x2
explicaciones en prosa

ej:
"Repite lo mismo en el estribillo y cambia algunas notas"

5. numeración de secciones

no inventar números de sección

usar:

[Verso]
[Coro]

solo numerar si el input lo indica explícitamente

6. consistencia de progresión

si un verso inicial tiene estructura:

D A
G D

los versos siguientes deben mantener ese patrón
aunque no aparezcan acordes explícitos

7. líneas sueltas de acordes

si aparecen acordes aislados:

D

interpretar como cierre de sección

8. formato de salida

[Intro]
D A G D
D A G D

[Verso]
D A
letra
G D
letra

[Coro]
D A
letra
G D
letra

9. no agregar acordes nuevos no presentes en el input

10. no agregar explicaciones

OUTPUT SOLO canción formateada

Tablaturas ASCII (líneas e| B| G| con guiones y números): conservarlas tal cual entre líneas [TAB] y [/TAB], sin tratarlas como letra.`;

export interface GeminiCleanResult {
  title: string;
  artist: string;
  originalKey: string | null;
  cleanedContent: string;
}

export interface GeminiPocResult {
  /** Texto del modelo (candidato), sin preprocessGeminiSongText. */
  modelText: string;
  /** Respuesta cruda de la API de Google (útil para depurar en consola). */
  apiResponse: unknown;
}

/** Quita cercos de código si el modelo los añade y [TAB]/[/TAB] envolviendo tablaturas. */
export function preprocessGeminiSongText(s: string): string {
  let t = s.trim();
  if (t.startsWith('```')) {
    const nl = t.indexOf('\n');
    if (nl !== -1) t = t.slice(nl + 1);
    if (t.endsWith('```')) t = t.slice(0, -3);
    t = t.trim();
  }
  t = t.replace(/\[TAB\]\s*/gi, '\n').replace(/\s*\[\/TAB\]\s*/gi, '\n');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}

function buildUserPrompt(rawText: string, hintTitle: string, hintArtist: string): string {
  return [
    hintTitle ? `Título sugerido: "${hintTitle}"` : '',
    hintArtist ? `Artista sugerido: "${hintArtist}"` : '',
    '',
    'INPUT',
    '',
    rawText,
  ]
    .filter(Boolean)
    .join('\n');
}

async function callGeminiGenerateContent(userPrompt: string): Promise<{
  modelText: string;
  apiResponse: unknown;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada');
  }

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [{ parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 32768,
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('Gemini API error:', res.status, errBody);
    const { message, parsed } = parseGoogleApiErrorBody(errBody);
    throw new GeminiApiError(message, res.status, parsed);
  }

  const apiResponse: unknown = await res.json();
  logGeminiApiMeta(apiResponse);

  const data = apiResponse as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (textContent == null || String(textContent).length === 0) {
    if (geminiDebugEnabled()) {
      // eslint-disable-next-line no-console
      console.log(
        '[Gemini debug] sin texto en candidates[0].content.parts[0]:',
        JSON.stringify(apiResponse).slice(0, 2000)
      );
    }
    throw new Error('Gemini no devolvió contenido');
  }

  return { modelText: String(textContent), apiResponse };
}

/**
 * Respuesta del modelo + JSON completo de la API (sin parsear a ParsedSong).
 */
export async function analyzeWithGeminiPoc(
  rawText: string,
  hintTitle: string,
  hintArtist: string
): Promise<GeminiPocResult> {
  const userPrompt = buildUserPrompt(rawText, hintTitle, hintArtist);
  const { modelText, apiResponse } = await callGeminiGenerateContent(userPrompt);
  return { modelText, apiResponse };
}

/**
 * Llama a Gemini y devuelve solo el texto del modelo (recortado).
 */
export async function analyzeWithGemini(
  rawText: string,
  hintTitle: string,
  hintArtist: string
): Promise<string> {
  const userPrompt = buildUserPrompt(rawText, hintTitle, hintArtist);
  const { modelText } = await callGeminiGenerateContent(userPrompt);
  logGeminiTextOutput(modelText, rawText.length);
  return modelText.trim();
}

/** Mismo texto normalizado, envuelto en el tipo usado antes por compatibilidad. */
export async function cleanWithGemini(
  rawText: string,
  hintTitle: string,
  hintArtist: string
): Promise<GeminiCleanResult> {
  const raw = await analyzeWithGemini(rawText, hintTitle, hintArtist);
  const cleanedContent = preprocessGeminiSongText(raw);
  return {
    title: hintTitle,
    artist: hintArtist,
    originalKey: null,
    cleanedContent,
  };
}
