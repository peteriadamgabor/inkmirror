import { For, onCleanup, onMount } from 'solid-js';
import { SiteNav } from '@/ui/layout/SiteNav';
import { FeedbackHost } from '@/ui/shared/FeedbackHost';
import {
  privacyContent,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_SECURITY_EMAIL,
} from '@/i18n/privacy';

const MirrorDivider = () => (
  <div
    class="w-32 mx-auto my-14 h-px"
    style={{
      background:
        'linear-gradient(to right, transparent, rgba(127,119,221,0.45), transparent)',
    }}
  />
);

const SectionH = (props: { children: string }) => (
  <h2 class="font-serif text-2xl md:text-3xl tracking-tight text-stone-100 mb-5">
    {props.children}
  </h2>
);

const SubH = (props: { children: string }) => (
  <h3 class="font-sans text-sm uppercase tracking-widest text-violet-300/80 mt-8 mb-3">
    {props.children}
  </h3>
);

const Bullets = (props: { items: string[] }) => (
  <ul class="space-y-2 mb-5 pl-1">
    <For each={props.items}>
      {(item) => (
        <li class="flex items-start gap-3">
          <span class="text-violet-500 mt-2 shrink-0 text-[10px]">◆</span>
          <span>{item}</span>
        </li>
      )}
    </For>
  </ul>
);

const NumberedSteps = (props: { items: string[] }) => (
  <ol class="space-y-3 mb-5 list-decimal pl-6 marker:text-violet-400/70">
    <For each={props.items}>{(item) => <li class="pl-1">{item}</li>}</For>
  </ol>
);

const NamedItems = (props: { items: Array<{ name: string; body: string }> }) => (
  <ul class="space-y-3 mb-5 pl-1">
    <For each={props.items}>
      {(item) => (
        <li class="flex items-start gap-3">
          <span class="text-violet-500 mt-2 shrink-0 text-[10px]">◆</span>
          <div>
            <span class="text-stone-100 font-medium">{item.name}.</span>{' '}
            <span>{item.body}</span>
          </div>
        </li>
      )}
    </For>
  </ul>
);

export const PrivacyRoute = () => {
  const c = privacyContent;

  onMount(() => {
    const prev = document.title;
    document.title = c().pageTitle;
    onCleanup(() => {
      document.title = prev;
    });
  });

  return (
    <div class="min-h-screen bg-stone-950 text-stone-100 font-sans inkmirror-paper">
      <SiteNav current="/privacy" />
      <FeedbackHost />

      <main class="max-w-3xl mx-auto px-6 pt-32 pb-24 font-serif text-stone-300 leading-relaxed text-[17px]">
        {/* --- Title --- */}
        <h1 class="font-serif text-4xl md:text-5xl tracking-tight text-stone-100 mb-3">
          {c().pageTitle.split(' — ')[0]}
        </h1>
        <p class="text-xs text-stone-500 font-sans mb-8 inkmirror-smallcaps tracking-widest">
          {c().lastUpdated}
        </p>
        <p class="text-stone-300 mb-2 text-[18px]">{c().intro}</p>

        <MirrorDivider />

        {/* --- Where your work lives --- */}
        <section>
          <SectionH>{c().whereLivesH}</SectionH>
          <p class="mb-4">{c().whereLivesIntro}</p>
          <Bullets items={c().whereLivesBullets} />
          <p class="mb-5">{c().whereLivesAfterBullets}</p>
          <ol class="space-y-3 list-decimal pl-6 marker:text-violet-400/70">
            <li class="pl-1">
              <span class="text-stone-100 font-medium">
                {c().whereLivesOption1Name}.
              </span>{' '}
              {c().whereLivesOption1Body}
            </li>
            <li class="pl-1">
              <span class="text-stone-100 font-medium">
                {c().whereLivesOption2Name}.
              </span>{' '}
              {c().whereLivesOption2Body}
            </li>
          </ol>
        </section>

        <MirrorDivider />

        {/* --- What we never see --- */}
        <section>
          <SectionH>{c().neverSeeH}</SectionH>
          <Bullets items={c().neverSeeBullets} />
          <p class="text-stone-400">{c().neverSeeCloser}</p>
        </section>

        <MirrorDivider />

        {/* --- Sync --- */}
        <section>
          <SectionH>{c().syncH}</SectionH>
          <p class="mb-2">{c().syncIntro}</p>

          <SubH>{c().syncKeysH}</SubH>
          <NumberedSteps items={c().syncKeysSteps} />

          <SubH>{c().syncPairingH}</SubH>
          <NumberedSteps items={c().syncPairingSteps} />
          <p class="mb-2 text-stone-400">{c().syncPairingNote}</p>

          <SubH>{c().syncMetadataH}</SubH>
          <p class="mb-3">{c().syncMetadataIntro}</p>
          <Bullets items={c().syncMetadataVisible} />
          <p class="mb-3">{c().syncMetadataCannotIntro}</p>
          <Bullets items={c().syncMetadataCannot} />

          <SubH>{c().syncForgottenH}</SubH>
          <p class="mb-2">{c().syncForgottenBody}</p>

          <SubH>{c().syncNotSyncedH}</SubH>
          <NamedItems items={c().syncNotSyncedItems} />

          <SubH>{c().syncDeleteH}</SubH>
          <p class="mb-3">{c().syncDeleteBody}</p>
          <p class="text-stone-400">{c().syncDeleteOfflineNote}</p>
        </section>

        <MirrorDivider />

        {/* --- Feedback --- */}
        <section>
          <SectionH>{c().feedbackH}</SectionH>
          <p class="mb-3">{c().feedbackIntro}</p>
          <Bullets items={c().feedbackFields} />
          <p>
            {c().feedbackCloserBefore}
            <a
              href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
              class="text-violet-300 hover:text-violet-200 underline underline-offset-4 decoration-violet-500/40 hover:decoration-violet-300"
            >
              {PRIVACY_CONTACT_EMAIL}
            </a>
            {c().feedbackCloserAfter}
          </p>
        </section>

        <MirrorDivider />

        {/* --- AI features --- */}
        <section>
          <SectionH>{c().aiH}</SectionH>
          <p class="mb-5">{c().aiP1}</p>
          <p>{c().aiP2}</p>
        </section>

        <MirrorDivider />

        {/* --- Sub-processors table --- */}
        <section>
          <SectionH>{c().subprocessorsH}</SectionH>
          <div class="overflow-x-auto rounded-xl border border-stone-800/80">
            <table class="w-full text-left text-sm font-sans">
              <thead class="bg-stone-900/60 text-stone-300 inkmirror-smallcaps tracking-widest text-xs">
                <tr>
                  <th class="px-4 py-3 font-medium">{c().subprocessorsColProvider}</th>
                  <th class="px-4 py-3 font-medium">{c().subprocessorsColRole}</th>
                  <th class="px-4 py-3 font-medium">{c().subprocessorsColSees}</th>
                </tr>
              </thead>
              <tbody class="text-stone-400">
                <For each={c().subprocessorsRows}>
                  {(row) => (
                    <tr class="border-t border-stone-800/80">
                      <td class="px-4 py-3 text-stone-200 font-medium align-top">
                        {row.provider}
                      </td>
                      <td class="px-4 py-3 align-top">{row.role}</td>
                      <td class="px-4 py-3 align-top">{row.sees}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </section>

        <MirrorDivider />

        {/* --- Your controls --- */}
        <section>
          <SectionH>{c().controlsH}</SectionH>
          <NamedItems items={c().controlsItems} />
        </section>

        <MirrorDivider />

        {/* --- Security disclosure --- */}
        <section>
          <SectionH>{c().securityH}</SectionH>
          <p>
            {c().securityBefore}
            <a
              href={`mailto:${PRIVACY_SECURITY_EMAIL}`}
              class="text-violet-300 hover:text-violet-200 underline underline-offset-4 decoration-violet-500/40 hover:decoration-violet-300"
            >
              {PRIVACY_SECURITY_EMAIL}
            </a>
            {c().securityAfter}
          </p>
        </section>

        <MirrorDivider />

        {/* --- Changes --- */}
        <section>
          <SectionH>{c().changesH}</SectionH>
          <p class="mb-3">{c().changesIntro}</p>
          <Bullets items={c().changesBullets} />
          <p class="text-stone-400">{c().changesCloser}</p>
        </section>
      </main>
    </div>
  );
};
