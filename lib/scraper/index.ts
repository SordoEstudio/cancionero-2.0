import axios from 'axios';
import * as cheerio from 'cheerio';
import type { ScrapeResult } from './types';
import { extractLaCuerda } from './lacuerda';
import { extractCifraClub } from './cifraclub';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const TIMEOUT_MS = 8000;

export async function scrapeSong(url: string): Promise<ScrapeResult> {
  let html: string;

  try {
    const response = await axios.get<string>(url, {
      timeout: TIMEOUT_MS,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
      maxRedirects: 5,
    });
    html = response.data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      code: 'FETCH_FAILED',
      message: `No se pudo obtener la URL: ${message}`,
    };
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return { code: 'FETCH_FAILED', message: 'URL malformada' };
  }

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
