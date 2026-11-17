import axios from 'axios';
import * as cheerio from 'cheerio';
import type { ScrapeResult } from './types';
import { extractLaCuerda } from './lacuerda';
import { extractCifraClub } from './cifraclub';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const TIMEOUT_MS = 10000;

export async function scrapeSong(url: string): Promise<ScrapeResult> {
  let html: string;

  let origin = '';
  try {
    const u = new URL(url);
    origin = `${u.protocol}//${u.hostname}`;
  } catch {
    return { code: 'FETCH_FAILED', message: 'URL malformada' };
  }

  try {
    const response = await axios.get<string>(url, {
      timeout: TIMEOUT_MS,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': origin + '/',
        'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
      },
      maxRedirects: 5,
      decompress: true,
    });
    html = response.data;
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    const hint = status === 403 || status === 429
      ? ' — el sitio bloqueó la descarga. Copiá el texto de la cifra y usá "Pegar texto".'
      : '';
    const message = err instanceof Error ? err.message : String(err);
    return {
      code: 'FETCH_FAILED',
      message: `No se pudo obtener la URL: ${message}${hint}`,
    };
  }

  const hostname = new URL(url).hostname.toLowerCase();

  const $ = cheerio.load(html);

  if (hostname.includes('lacuerda.net')) {
    return extractLaCuerda($, url);
  }

  if (hostname.includes('cifraclub.com')) {
    return extractCifraClub($, url);
  }

  return {
    code: 'SITE_UNSUPPORTED',
    message: `Sitio no soportado: ${hostname}. Solo lacuerda.net y cifraclub.com.`,
  };
}
