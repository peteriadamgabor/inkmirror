export const SENTIMENT_COLORS: Record<string, string> = {
  // Legacy 3-class labels
  positive: 'text-emerald-500',
  neutral: 'text-stone-400',
  negative: 'text-red-500',
  // Near tier mood palette: approximations of MOOD_HUE in Tailwind.
  // PRODUCT.md anti-references include indigo (Linear/Vercel/AI-startup
  // cliché), so wonder lands on a writer-violet shade instead. The mood
  // heatmap also pairs every color with a label and a magnitude, so
  // colorblind users have multiple cues.
  tender: 'text-pink-300',
  joy: 'text-amber-400',
  hope: 'text-emerald-400',
  wonder: 'text-violet-300',
  calm: 'text-slate-300',
  longing: 'text-purple-300',
  tension: 'text-orange-400',
  dread: 'text-purple-700',
  grief: 'text-slate-500',
  rage: 'text-red-400',
};
