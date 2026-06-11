/**
 * Real UI implementation of the `ImportBridgeUi` capabilities that
 * `@/store/import-bridge` receives via dependency injection. Lives in
 * ui/shared so the store layer never imports from ui/ — DocumentPicker
 * and the PWA launch handlers pass this object in.
 */

import type { ImportBridgeUi } from '@/store/import-bridge';
import { askConfirmChoice } from './confirm';
import { toast } from './toast';

export const importBridgeUi: ImportBridgeUi = {
  confirmChoice: askConfirmChoice,
  notifySuccess: (message) => {
    toast.success(message);
  },
  notifyError: (message) => {
    toast.error(message);
  },
};
