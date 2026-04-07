/**
 * Gemini como preprocesador: toma texto crudo pegado por el usuario (que puede
 * incluir dedicatorias, explicaciones, tablaturas, emojis, etc.) y devuelve
 * texto limpio en el formato estándar que el parser heurístico ya entiende:
 *
 *   [Intro]
 *   Am   F   C   G
 *
 *   [Verso]
 *   Am          F
 *   Línea de letra aquí
 *   C           G
 *   Otra línea de letra
 *
 * También extrae título, artista y tonalidad si los detecta.
 */

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_PROMPT = `Sos un experto en cifrado musical. Tu tarea es LIMPIAR texto crudo de una canción que pegó un usuario.

El texto puede contener:
- Acordes y letra (lo que necesitamos)
- Dedicatorias, saludos, notas del autor
- Explicaciones de cómo tocar ("rasgueo: abajo-arriba")
- Tablaturas (e|--0--2--, B|--3--, etc.)
- Repeticiones escritas ("x2", "repite coro")
- Emojis, links, spam
- Mezcla de idiomas
- Acordes en distintos formatos: [Am], (Am), Am, inline dentro de la letra

REGLAS DE SALIDA:
1. Devolvé SOLO la cifra limpia en formato texto plano.
2. Formato: línea de acordes arriba, línea de letra abajo. Los acordes deben estar posicionados sobre la sílaba de la letra donde van.
3. Secciones separadas por una línea en blanco.
4. Etiquetas de sección en formato [Intro], [Verso], [Coro], [Puente], [Pre-coro], [Solo], [Final].
5. ELIMINÁ: dedicatorias, explicaciones, tablaturas, links, emojis, notas del autor, spam.
6. Si hay acordes inline como "[Am]hola [F]mundo" o "(Am)hola (F)mundo", convertí al formato estándar (acordes arriba, letra abajo) posicionando cada acorde sobre la sílaba correcta.
7. Notación anglosajona: C, C#, Db, Dm, G7, Bbm, Cmaj7, etc.
8. Si se repite un coro o sección, poné la sección completa (no "repite coro").

Respondé ÚNICAMENTE con JSON válido, con esta estructura:
{
  "title": "título detectado o vacío",
  "artist": "artista detectado o vacío",
  "originalKey": "tonalidad detectada o null",
  "cleanedContent": "texto limpio en formato estándar, con \\n para saltos de línea"
}`;

export interface GeminiCleanResult {
  title: string;
  artist: string;
  originalKey: string | null;
  cleanedContent: string;
}

export async function cleanWithGemini(
  rawText: string,
  hintTitle: string,
  hintArtist: string
): Promise<GeminiCleanResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no configurada');
  }

  const userPrompt = `Título sugerido: "${hintTitle}"
Artista sugerido: "${hintArtist}"

Texto crudo:
${rawText}`;

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        { parts: [{ text: userPrompt }] },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 16384,
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

  const cleaned = typeof parsed.cleanedContent === 'string' ? parsed.cleanedContent : '';
  if (cleaned.trim().length === 0) {
    throw new Error('Gemini devolvió contenido vacío');
  }

  return {
    title:
      typeof parsed.title === 'string' && parsed.title.trim().length > 0
        ? parsed.title.trim()
        : hintTitle,
    artist:
      typeof parsed.artist === 'string' && parsed.artist.trim().length > 0
        ? parsed.artist.trim()
        : hintArtist,
    originalKey:
      typeof parsed.originalKey === 'string' && parsed.originalKey.trim().length > 0
        ? parsed.originalKey.trim()
        : null,
    cleanedContent: cleaned,
  };
}
