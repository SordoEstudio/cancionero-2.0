import { NextRequest, NextResponse } from 'next/server';
import { scrapeSong } from '@/lib/scraper';
import { isScrapeError } from '@/lib/scraper/types';
import {
  analyzeWithGeminiPoc,
  GeminiApiError,
  httpStatusForGeminiError,
} from '@/lib/ai/gemini-parse';
import { z } from 'zod';

const BodySchema = z.object({
  url: z.string().url('URL inválida'),
});

/**
 * POC: scrape URL soportada → Gemini sin parseSong.
 * El cliente debe hacer console.log del JSON (modelText + apiResponse).
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Datos inválidos' },
      { status: 400 }
    );
  }

  const scrapeResult = await scrapeSong(parsed.data.url);
  if (isScrapeError(scrapeResult)) {
    const statusMap: Record<string, number> = {
      SITE_UNSUPPORTED: 400,
      FETCH_FAILED: 502,
      PARSE_FAILED: 422,
      EMPTY_CONTENT: 422,
    };
    return NextResponse.json(
      { error: scrapeResult.message, code: scrapeResult.code },
      { status: statusMap[scrapeResult.code] ?? 500 }
    );
  }

  try {
    const { modelText, apiResponse } = await analyzeWithGeminiPoc(
      scrapeResult.rawContent,
      scrapeResult.title,
      scrapeResult.artist
    );

    return NextResponse.json({
      modelText,
      apiResponse,
      scrape: {
        title: scrapeResult.title,
        artist: scrapeResult.artist,
        sourceUrl: scrapeResult.sourceUrl,
        rawContentLength: scrapeResult.rawContent.length,
      },
    });
  } catch (e) {
    console.error('gemini-poc:', e);
    if (e instanceof GeminiApiError) {
      return NextResponse.json(
        {
          error: e.message,
          code: 'GEMINI_API_ERROR',
          geminiHttpStatus: e.httpStatus,
          details: e.details,
        },
        { status: httpStatusForGeminiError(e.httpStatus) }
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes('GEMINI_API_KEY') ? 500 : 503;
    return NextResponse.json({ error: msg, code: 'GEMINI_CLIENT_ERROR' }, { status });
  }
}
