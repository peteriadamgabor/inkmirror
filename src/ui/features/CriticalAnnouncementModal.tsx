import { Show } from 'solid-js';
import { ModalBackdrop } from '@/ui/shared/ModalBackdrop';
import { lang, t } from '@/i18n';
import {
  pendingCritical,
  dismissCritical,
} from '@/announcements/store';
import { acknowledgeCritical } from '@/announcements/state';
import { pickLocalized } from '@/announcements/localize';

/**
 * Critical-severity announcements render here. Bypasses the toast
 * surface so the user can't keep typing past a "sync schema bumped,
 * please re-pair" notice. Acknowledgement is sticky — once clicked,
 * the id goes into `acknowledgedCriticals` and we never show it again.
 */
export const CriticalAnnouncementModal = () => {
  const handleAcknowledge = (): void => {
    const a = pendingCritical();
    if (!a) return;
    acknowledgeCritical(a.id);
    dismissCritical();
  };

  return (
    <Show when={pendingCritical()}>
      {(active) => {
        const a = active();
        const title = () => pickLocalized(a.title, lang());
        const body = () => pickLocalized(a.body, lang());
        return (
          <ModalBackdrop>
            <div
              class="w-[480px] max-w-[92vw] bg-white dark:bg-stone-800 rounded-2xl border border-orange-200 dark:border-orange-900 shadow-2xl flex flex-col gap-4 p-6"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={t('announcements.criticalEyebrow')}
            >
              <div>
                <div class="text-[10px] inkmirror-smallcaps text-orange-500 mb-1">
                  {t('announcements.criticalEyebrow')}
                </div>
                <h2 class="font-serif text-lg text-stone-900 dark:text-stone-50">
                  {title()}
                </h2>
              </div>
              <div class="text-sm text-stone-700 dark:text-stone-200 leading-relaxed whitespace-pre-line">
                {body()}
              </div>
              <Show when={a.link}>
                <a
                  href={a.link!}
                  target="_blank"
                  rel="noopener"
                  class="text-sm text-violet-600 dark:text-violet-300 underline decoration-dotted underline-offset-2"
                >
                  {t('announcements.learnMore')}
                </a>
              </Show>
              <div class="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleAcknowledge}
                  class="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 transition-colors"
                >
                  {t('announcements.acknowledge')}
                </button>
              </div>
            </div>
          </ModalBackdrop>
        );
      }}
    </Show>
  );
};
