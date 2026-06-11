// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleHfProxy } from './hf-proxy';

const SENTIMENT_PATH =
  'Xenova/distilbert-base-multilingual-cased-sentiments-student/resolve/main/onnx/model_quantized.onnx';
const NLI_PATH =
  'Xenova/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7/resolve/main/config.json';

function stubUpstreamFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () =>
    new Response('model-bytes', {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function get(path: string): Request {
  return new Request(`https://inkmirror.cc/hf-proxy/${path}`);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hf-proxy repo allowlist', () => {
  it('proxies the sentiment model repo', async () => {
    const fetchMock = stubUpstreamFetch();
    const res = await handleHfProxy(get(SENTIMENT_PATH));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://huggingface.co/${SENTIMENT_PATH}`);
  });

  it('proxies the zero-shot NLI model repo (rich moods + inconsistency)', async () => {
    stubUpstreamFetch();
    const res = await handleHfProxy(get(NLI_PATH));
    expect(res.status).toBe(200);
  });

  it('rejects a non-allowlisted repo with 403 without contacting upstream', async () => {
    const fetchMock = stubUpstreamFetch();
    const res = await handleHfProxy(
      get('EvilOrg/some-70b-llm/resolve/main/model-00001-of-00099.safetensors'),
    );
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an allowlisted model name under the wrong org', async () => {
    const fetchMock = stubUpstreamFetch();
    const res = await handleHfProxy(
      get('NotXenova/distilbert-base-multilingual-cased-sentiments-student/resolve/main/config.json'),
    );
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still 404s paths that fail the shape check before the allowlist', async () => {
    const fetchMock = stubUpstreamFetch();
    const res = await handleHfProxy(get('Xenova/../../etc/passwd'));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
