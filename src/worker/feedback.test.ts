// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleFeedback } from './feedback';
import type { Env } from './types';

// Only DISCORD_WEBHOOK matters to the feedback handler.
function makeEnv(): Env {
  return { DISCORD_WEBHOOK: 'https://discord.test/webhook' } as unknown as Env;
}

/**
 * Valid-by-construction feedback request: JSON content-type, explicit
 * content-length, startedAt far enough in the past to pass the min-2s
 * render-to-submit gate. No cf-connecting-ip header → ip resolves to
 * 'unknown' → rate limiting (and its Cache API dependency) is bypassed.
 */
function makeRequest(message: string): Request {
  const body = JSON.stringify({ message, startedAt: Date.now() - 5000 });
  return new Request('http://x/feedback', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(new TextEncoder().encode(body).length),
    },
    body,
  });
}

interface DiscordBody {
  embeds: Array<{ description: string }>;
}

/** Stub global fetch and return a getter for the captured Discord payload. */
function stubDiscordFetch(): () => DiscordBody {
  const fetchMock = vi.fn(
    async (_input: string | URL | Request, _init?: { body?: string }) =>
      new Response('ok', { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    return JSON.parse(fetchMock.mock.calls[0][1]?.body ?? '') as DiscordBody;
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('feedback Discord embed length', () => {
  it('keeps the escaped description within the 4000-char cap (Discord limit is 4096)', async () => {
    // 4000 markdown chars pass the pre-escape length check but would
    // escape to 8000 chars — the old code sliced BEFORE escaping and
    // shipped that to Discord, causing a 400 → 502.
    const getBody = stubDiscordFetch();
    const res = await handleFeedback(makeRequest('*'.repeat(4000)), makeEnv());
    expect(res.status).toBe(200);

    const description = getBody().embeds[0].description;
    expect(description.length).toBeLessThanOrEqual(4000);
    expect(description).toBe('\\*'.repeat(2000));
  });

  it('never cuts an escape sequence in half at the slice boundary', async () => {
    // 3999 plain chars + one '*' escapes to 4001 chars; a naive slice at
    // 4000 would end on a lone backslash that re-arms the next character.
    const getBody = stubDiscordFetch();
    const res = await handleFeedback(makeRequest('a'.repeat(3999) + '*'), makeEnv());
    expect(res.status).toBe(200);

    const description = getBody().embeds[0].description;
    expect(description).toBe('a'.repeat(3999));
    expect(description.endsWith('\\')).toBe(false);
  });

  it('passes short messages through escaped but untruncated', async () => {
    const getBody = stubDiscordFetch();
    const res = await handleFeedback(makeRequest('hello *world*'), makeEnv());
    expect(res.status).toBe(200);
    expect(getBody().embeds[0].description).toBe('hello \\*world\\*');
  });

  it('still rejects messages over the pre-escape cap with 400', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await handleFeedback(makeRequest('a'.repeat(4001)), makeEnv());
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
