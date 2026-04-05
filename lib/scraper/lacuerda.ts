import type { CheerioAPI } from 'cheerio';
import type { RawSongData, ScrapeError } from './types';

/**
 * Extrae datos de una página de LaCuerda.net
 * Estructura HTML típica:
 *   <h1 id="tit_1"> Título - Artista </h1>
 *   <div id="cifra_cnt"><pre>...contenido...</pre></div>
 */
function extractPreText($: CheerioAPI, el: ReturnType<CheerioAPI>): string {
  const clone = el.clone();
  clone.find('span').each((_, span) => {
    const $span = $(span);
    if ($span.hasClass('anuncio') || $span.hasClass('ad') || $span.attr('style')?.includes('display:none')) {
      $span.remove();
    } else {
      $span.replaceWith($span.text());
    }
  });
  // Acordes en <A>Bm</A> — conservar el texto del acorde
  clone.find('a').each((_, a) => {
    const $a = $(a);
    $a.replaceWith($a.text());
  });
  return clone.text();
}

export function extractLaCuerda($: CheerioAPI, sourceUrl: string): RawSongData | ScrapeError {
  let title = '';
  let artist = '';

  const tH1 = $('#tH1 h1').first();
  const tH2 = $('#tH1 h2').first();
  if (tH1.length && tH2.length) {
    title = tH1.text().trim();
    artist = tH2.text().trim();
  } else {
    const h1 = $('h1').first().text().trim();
    if (h1) {
      const parts = h1.split(' - ');
      if (parts.length >= 2) {
        title = parts[0].trim();
        artist = parts.slice(1).join(' - ').trim();
      } else {
        title = h1;
      }
    }
  }

  if (!title) {
    const metaTitle = $('title').text().trim();
    title = metaTitle.replace(/\| La Cuerda/gi, '').replace(/LaCuerda\.net/gi, '').trim();
  }

  let rawContent = '';

  const selectors = [
    '#t_body pre', // acordes.lacuerda.net: el primer <pre> (#tCode) suele ir vacío hasta el JS
    '#cifra_cnt pre',
    '.cifra_cnt pre',
    '#cont_tab pre',
  ];

  const minLen = 50;

  for (const sel of selectors) {
    const el = $(sel).first();
    if (!el.length) continue;
    const text = extractPreText($, el).trim();
    if (text.length >= minLen) {
      rawContent = text;
      break;
    }
  }

  if (!rawContent || rawContent.trim().length < minLen) {
    $('pre').each((_, node) => {
      const el = $(node);
      const text = extractPreText($, el).trim();
      if (text.length >= minLen) {
        rawContent = text;
        return false;
      }
    });
  }

  if (!rawContent || rawContent.trim().length < 50) {
    return {
      code: 'EMPTY_CONTENT',
      message: `LaCuerda: no se encontró contenido en ${sourceUrl}`,
    };
  }

  return { title, artist, sourceUrl, rawContent };
}
