import { describe, it, expect, beforeEach, vi } from 'vitest';

const importBridgeMock = vi.hoisted(() => vi.fn());

vi.mock('@/store/import-bridge', () => ({
  importBridge: importBridgeMock,
}));

let module: typeof import('./pwa-launch');

interface MockCache {
  match: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}
const mockCache: MockCache = {
  match: vi.fn(),
  delete: vi.fn(),
};

beforeEach(async () => {
  vi.resetModules();
  importBridgeMock.mockReset();
  mockCache.match.mockReset();
  mockCache.delete.mockReset();
  Object.defineProperty(globalThis, 'caches', {
    writable: true,
    configurable: true,
    value: { open: vi.fn(async () => mockCache) },
  });
  history.replaceState(null, '', '/');
  module = await import('./pwa-launch');
});

describe('pwa-launch — ?share=<uuid>', () => {
  it('reads cache, calls importBridge, deletes entry, replaces URL', async () => {
    history.replaceState(null, '', '/?share=abc-123-def-456-7890-abcdefabcdef');
    mockCache.match.mockResolvedValue(
      new Response('{}', {
        headers: {
          'content-type': 'application/json',
          'x-share-name': encodeURIComponent('shared.json'),
        },
      }),
    );

    await module.consumeShareTargetIfPresent();

    expect(importBridgeMock).toHaveBeenCalled();
    const [bridgeFile] = importBridgeMock.mock.calls[0];
    expect(bridgeFile).toBeInstanceOf(File);
    expect(bridgeFile.name).toBe('shared.json');
    expect(mockCache.delete).toHaveBeenCalled();
    expect(location.search).toBe('');
  });

  it('does nothing when there is no ?share=', async () => {
    history.replaceState(null, '', '/');
    await module.consumeShareTargetIfPresent();
    expect(importBridgeMock).not.toHaveBeenCalled();
  });

  it('does nothing when cache is empty', async () => {
    history.replaceState(null, '', '/?share=abc-123-def-456-7890-abcdefabcdef');
    mockCache.match.mockResolvedValue(undefined);
    await module.consumeShareTargetIfPresent();
    expect(importBridgeMock).not.toHaveBeenCalled();
  });
});

describe('pwa-launch — launchQueue (file_handlers)', () => {
  it('subscribes when launchQueue is present and forwards files to importBridge', async () => {
    let consumer:
      | ((params: { files: Array<{ getFile: () => Promise<File> }> }) => Promise<void>)
      | null = null;
    Object.defineProperty(window, 'launchQueue', {
      writable: true,
      configurable: true,
      value: {
        setConsumer: (c: typeof consumer) => {
          consumer = c;
        },
      },
    });

    module.installPwaLaunchHandler();
    expect(consumer).not.toBeNull();

    const file = new File(['{}'], 'novel.inkmirror.json', { type: 'application/json' });
    await consumer!({
      files: [{ getFile: async () => file }],
    });
    expect(importBridgeMock).toHaveBeenCalledWith(file, expect.any(Object));
  });

  it('is a no-op when launchQueue is missing', () => {
    Object.defineProperty(window, 'launchQueue', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    module.installPwaLaunchHandler();
    expect(importBridgeMock).not.toHaveBeenCalled();
  });
});
