import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

const {
  parseBundleMock,
  importDocumentBundleMock,
  importDatabaseBackupMock,
  askConfirmChoiceMock,
  loadDocumentMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  parseBundleMock: vi.fn(),
  importDocumentBundleMock: vi.fn(),
  importDatabaseBackupMock: vi.fn(),
  askConfirmChoiceMock: vi.fn(),
  loadDocumentMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

const refetchMock = vi.fn();

vi.mock('@/backup/import', () => ({
  parseBundle: parseBundleMock,
  importDocumentBundle: importDocumentBundleMock,
  importDatabaseBackup: importDatabaseBackupMock,
}));
vi.mock('@/db/repository', () => ({
  loadDocument: loadDocumentMock,
}));
vi.mock('@/i18n', () => ({
  t: (key: string) => key,
}));

import { importBridge, type ImportBridgeUi } from './import-bridge';

// Confirm/toast arrive via DI (store/ must not import ui/) — the real
// implementations live in @/ui/shared/import-ui; tests inject fakes.
const ui: ImportBridgeUi = {
  confirmChoice: askConfirmChoiceMock,
  notifySuccess: toastSuccessMock,
  notifyError: toastErrorMock,
};

beforeEach(() => {
  vi.clearAllMocks();
  refetchMock.mockReset();
});

describe('importBridge', () => {
  const file = new File(['{}'], 'novel.inkmirror.json', { type: 'application/json' });

  it('imports a fresh document bundle without collision', async () => {
    parseBundleMock.mockResolvedValue({
      kind: 'inkmirror.document',
      document: { id: 'doc-1' },
    });
    loadDocumentMock.mockResolvedValue(null);
    importDocumentBundleMock.mockResolvedValue({
      kind: 'document',
      documentsAdded: 1,
      documentsSkipped: 0,
      documentTitles: ['Novel'],
    });

    await importBridge(file, ui, { onAfterImport: refetchMock });

    expect(parseBundleMock).toHaveBeenCalledWith(file);
    expect(askConfirmChoiceMock).not.toHaveBeenCalled();
    expect(importDocumentBundleMock).toHaveBeenCalledWith(expect.any(Object), 'copy');
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(refetchMock).toHaveBeenCalled();
  });

  it('shows collision modal and uses replace strategy when user confirms', async () => {
    parseBundleMock.mockResolvedValue({
      kind: 'inkmirror.document',
      document: { id: 'doc-1' },
    });
    loadDocumentMock.mockResolvedValue({ document: { title: 'Existing Novel' } });
    askConfirmChoiceMock.mockResolvedValue('confirm');
    importDocumentBundleMock.mockResolvedValue({
      kind: 'document',
      documentsAdded: 0,
      documentsSkipped: 0,
      replaced: true,
      documentTitles: ['Existing Novel'],
    });

    await importBridge(file, ui, { onAfterImport: refetchMock });

    expect(askConfirmChoiceMock).toHaveBeenCalled();
    expect(importDocumentBundleMock).toHaveBeenCalledWith(expect.any(Object), 'replace');
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it('aborts when user cancels collision modal', async () => {
    parseBundleMock.mockResolvedValue({
      kind: 'inkmirror.document',
      document: { id: 'doc-1' },
    });
    loadDocumentMock.mockResolvedValue({ document: { title: 'Existing' } });
    askConfirmChoiceMock.mockResolvedValue('cancel');

    await importBridge(file, ui, { onAfterImport: refetchMock });

    expect(importDocumentBundleMock).not.toHaveBeenCalled();
    expect(refetchMock).not.toHaveBeenCalled();
  });

  it('routes database backups to importDatabaseBackup', async () => {
    parseBundleMock.mockResolvedValue({ kind: 'inkmirror.database', documents: [] });
    importDatabaseBackupMock.mockResolvedValue({
      kind: 'database',
      documentsAdded: 2,
      documentsSkipped: 0,
      documentTitles: [],
    });

    await importBridge(file, ui, { onAfterImport: refetchMock });

    expect(importDatabaseBackupMock).toHaveBeenCalled();
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(refetchMock).toHaveBeenCalled();
  });

  it('toasts on parse error and does not call onAfterImport', async () => {
    parseBundleMock.mockRejectedValue(new Error('not valid JSON'));

    await importBridge(file, ui, { onAfterImport: refetchMock });

    expect(toastErrorMock).toHaveBeenCalled();
    expect(refetchMock).not.toHaveBeenCalled();
  });
});
