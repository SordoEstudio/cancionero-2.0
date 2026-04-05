import type { CheerioAPI } from 'cheerio';
import type { RawSongData, ScrapeError } from './types';

/**
 * Extrae datos de una página de CifraClub.com.br
 * Estructura HTML típica:
 *   <h1 class="t1"> Título </h1>
 *   <h2> <a>Artista</a> </h2>
 *   <div class="cifra_cnt"><pre>...contenido...</pre></div>
 */
export function extractCifraClub($: CheerioAPI, sourceUrl: string): RawSongData | ScrapeError {
  let title = '';
  let artist = '';

  // Título
  title = $('h1.t1').first().text().trim() ||
          $('h1').first().text().trim() ||
          $('title').text().replace('| Cifra Club', '').trim();

  // Artista — usualmente en h2 con un <a>
  artist = $('h2 a').first().text().trim() ||
           $('h2').first().text().trim();

  // Contenido de cifra
  let rawContent = '';

  const selectors = [
    '.cifra_cnt pre',
    '#cifra_cnt pre',
    '.cifra pre',
    'pre',
  ];

  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) {
      // CifraClub usa <b> para acordes dentro del pre
      // Convertir <b>Acorde</b> a texto plano preservando el contenido
      el.find('b').each((_, b) => {
        $(b).replaceWith($(b).text());
      });
      el.find('span').each((_, span) => {
        $(span).replaceWith($(span).text());
      });
      rawContent = el.text();
      break;
    }
  }

  if (!rawContent || rawContent.trim().length < 50) {
    return {
      code: 'EMPTY_CONTENT',
      message: `CifraClub: no se encontró contenido en ${sourceUrl}`,
    };
  }

  return { title, artist, sourceUrl, rawContent };
}
