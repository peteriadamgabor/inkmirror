/**
 * English prose for the demo bundle — Chekhov's "Rothschild's Fiddle"
 * translated for InkMirror. Paired 1:1 with block IDs in demo-bundle.ts.
 *
 * Keep the prose as close to the original's rhythm as possible. Short
 * sentences where Chekhov was short, longer where he was long. Don't
 * editorialize; don't modernize away the register.
 */

export const demoMetaEn = {
  title: "Rothschild's Fiddle — a demo",
  author: 'Anton Chekhov · translated for InkMirror',
  synopsis:
    "A coffin-maker in a dying Russian town keeps a ledger of his losses. In the end, the truest loss turns out to be the life he failed to notice. A short piece about grief, regret, and the inheritance of a tune.",

  'character.yakov.name': 'Yakov Ivanov',
  'character.yakov.aliases': ['Yakov', 'Yakov Matveyich', 'Bronze'],
  'character.rothschild.name': 'Rothschild',
  'character.rothschild.aliases': ['the flautist', 'Moisey Ilyich'],

  'scene1.location': "Yakov's workshop and house",
  'scene1.time': 'a winter evening',
  'scene1.mood': 'grim',
  'scene2.location': 'The river bank beyond the rye field',
  'scene2.time': 'late afternoon, after the funeral',
  'scene2.mood': 'tender',
  'scene3.location': "Yakov's house — the final day",
  'scene3.time': 'dusk',
  'scene3.mood': 'melancholy',

  'parens.barelyLooking': 'barely looking up',
  'parens.withoutOpeningEyes': 'without opening her eyes',
  'parens.aloudNoOne': 'aloud, to no one',
  'parens.outOfBreath': 'out of breath',
  'parens.atWindow': 'at the window',
  'parens.quietly': 'quietly',

  'graveyard.fromCh2': 'Two — the river bank',
  'graveyard.fromCh3': 'Three — the fiddle',
} as const;

export const demoChapterTitlesEn = {
  ch1: 'One — losses',
  ch2: 'Two — the river bank',
  ch3: 'Three — the fiddle',
} as const;

export const demoProseEn: Record<string, string> = {
  // ---------- Chapter 1 ----------
  'demo-blk-01':
    "This is a sample document shipped with InkMirror. Edit it, rearrange blocks, toggle dialogue speakers, try the export menu, delete the whole thing from the picker when you're done. Nothing you do here will affect anything outside this browser.",

  'demo-blk-03':
    "The town was small, smaller than a village, and its inhabitants were mostly the old. They died so seldom that it was vexing. Yakov Ivanov, the coffin-maker, kept a careful ledger of what each death cost him, and another ledger of the deaths that had not occurred — these he called his losses. He filed them among the year's accounts.",

  'demo-blk-04':
    "He was a tall, gaunt man of seventy, with enormous hands and a white beard, and the townspeople called him Bronze, though the reason for the name had been forgotten. He was a coffin-maker by trade, and a fiddler by evening. When the townspeople celebrated a wedding, the Jewish orchestra hired him to join them, for he played the fiddle well and cheaply. The flautist of the orchestra was a thin red-headed man called Rothschild, whom Yakov could not bear. Every rouble paid to Rothschild was, in Yakov's ledger, a rouble lost — for the orchestra's earnings were divided, and what Rothschild earned Yakov did not.",

  'demo-blk-05':
    "His wife, Marfa, went about the work of their small house without speaking. They had been married fifty-two years. In all that time Yakov had never thought of her as anything but a fixture — the kettle, the bench, the broom. He scolded her when he was in a temper, which was often, and called her \"useless old woman\" when the fire smoked, which was sometimes his fault and sometimes hers. She bore his scolding without reply.",

  'demo-blk-06':
    "They had once had a child, a girl with fair hair. Yakov could no longer remember her. When he tried, he saw only the coffin he had made for her, which had been small. The child had died long ago, and that too was a loss, but he had forgotten what kind.",

  'demo-blk-07':
    "Move, you useless old woman.",

  'demo-blk-08':
    "One evening in late winter, Marfa did not rise to cook. She lay on the brick stove where she slept, and her breath rattled in her chest. Yakov came in from the workshop and found no supper. He struck the table with his fist and went to the stove.",

  'demo-blk-09':
    "What's the matter with you?",

  'demo-blk-10':
    "Well? Are you deaf?",

  'demo-blk-11':
    'Marfa opened her eyes. They were very clear. She said, in the same ordinary voice she used for any errand:',

  'demo-blk-12':
    "I am going to die, Yakov. I'm going to die tonight or tomorrow.",

  'demo-blk-13':
    "He went out and fetched Maxim Nikolaich, the feldsher, from the town. The young man listened to Marfa's chest through a rolled paper, looked at her tongue, and said there was nothing to be done. Fever. Old age. Yakov walked home beside him through the slush and paid him half a rouble. Half a rouble, he thought. Then the coffin: half a rouble of his own labor into the ground. He did not grieve. He made the coffin that night by candlelight and measured her in the morning.",

  'demo-blk-14':
    "Yakov.",

  'demo-blk-15':
    "Yes.",

  'demo-blk-16':
    "She did not speak for a long time. Then she said, very quietly, as if she were asking after a person he had once known:",

  'demo-blk-17':
    "Do you remember? Fifty years ago, God sent us a baby with fair hair. We used to sit by the river, under the willow — you and I and the child — and sing.",

  'demo-blk-18':
    "He stared at her. He had no memory of any willow, any river, any fair-haired child singing. But she had said it with such certainty — as of a thing that had happened not once but many times, every summer perhaps — that a chill moved through him. She died that evening. He dressed her, laid her in the coffin he had made, and watched the priest come and go. He did not cry. He felt only the loss of the half rouble, and a second thing he could not name, which was the shape of something he had failed to see.",

  // ---------- Chapter 2 ----------
  'demo-blk-20':
    "After the funeral he did not go home. He walked out of the town along the road that passed the rye field, which was still white in patches, and came to a river — broad and slow-moving, with willows leaning over the water. And there, suddenly, it came back to him.",

  'demo-blk-21':
    "He had stood at this bank fifty years ago, holding a child with fair hair. The willow had been the same willow. The child had put her small hand into the water and laughed, and Marfa had sung — Marfa who never sang anywhere else, who in the house was only a fixture — had sung a little song about a fish. They had come here often, he and Marfa and the girl, every summer for some years. He had forgotten it entirely.",

  'demo-blk-22':
    "He sat down on a stump by the water and wept. It came over him all at once, and he could not stop. His hands, which had made so many coffins, shook on his knees.",

  'demo-blk-23':
    "What losses there have been.",

  'demo-blk-24':
    "He thought of the fifty years of his marriage — fifty years in which he had not looked at his wife's face, had not held her hand, had scolded her for nothing and taken her silence for stupidity. He thought of the child he had forgotten. He thought of the river he had not walked to since. He thought of the dozens of weddings for which he had been paid while hating the flautist beside him. What had he been doing in those fifty years? He had been making coffins. He had been reckoning his losses. He saw now, with a clarity that came too late, that his whole life had been a kind of loss, and that he had been the one losing it.",

  'demo-blk-25':
    'The river went on flowing. The willows went on leaning. Above the water a single heron stood, perfectly still, then turned its head as if it had heard something nobody else had heard.',

  'demo-blk-26':
    "On the path back toward the town he met Rothschild the flautist, who was hurrying out from the village with a message. The red-haired flautist was afraid of Yakov, as he always had been, and stopped a few yards off, wringing his hands.",

  'demo-blk-27':
    "Yakov Matveyich! Shakhkes — the wedding — the orchestra has been looking — —",

  'demo-blk-28':
    "Get away from me.",

  'demo-blk-29':
    "He raised his hand. He would have struck the flautist — he had wanted to, most Sundays, for twenty years — but instead he only turned and walked past him, toward his house, which was empty now, and would stay empty.",

  'demo-blk-gr1':
    "(He had meant to curse the flautist once more, over his shoulder, but when he turned, Rothschild was already running away through the rye.)",

  // ---------- Chapter 3 ----------
  'demo-blk-31':
    "That night he did not sleep. In the morning his hands shook, and by afternoon he could not stand. He lay on the brick stove where Marfa had lain, and he felt the fever climb into his chest — the same fever, he thought, the very same — and he understood that the feldsher was not going to be fetched, that nobody was going to be paid half a rouble for him, and that he would die in this house tonight or tomorrow.",

  'demo-blk-32':
    "He thought of his fiddle. He thought about it for a long time, as if it were a person. Then, slowly, he took it down from its peg on the wall and brought it back to the stove, and sat up with it across his knees.",

  'demo-blk-33':
    "It was a small fiddle, very old. The neck was worn where his hand had held it for fifty years. He tuned it, which took him a long time because his hands shook, and then he began to play.",

  'demo-blk-34':
    "He did not play any of the tunes he had played at weddings — he had never much liked those tunes. He played something else. It was a melody that came out of him without his asking, long and slow, and plainly sad; a tune about the river, perhaps, or the willow, or the half rouble, or the girl with fair hair, or the fifty years, or the flautist, or all of them together. Below his window, on the road, someone who had been walking past stopped to listen.",

  'demo-blk-35':
    "Yakov Matveyich. What is that you're playing?",

  'demo-blk-36':
    "Come in.",

  'demo-blk-37':
    'Rothschild came in, terrified. He had never in twenty years been invited into this house except by argument. He stood in the doorway with his cap in his hands, not knowing whether to sit.',

  'demo-blk-38':
    "Take the fiddle.",

  'demo-blk-39':
    "What?",

  'demo-blk-40':
    "Take it. I will be dead before the priest arrives. Take the fiddle, and play.",

  'demo-blk-41':
    'He pressed the fiddle and the bow into the flautist\'s hands. Rothschild received them without speaking, because he did not know what to say. The two men looked at each other for the first time as two men rather than as two roubles in an orchestra\'s accounts.',

  'demo-blk-42':
    "That tune I was playing. Do you remember it?",

  'demo-blk-43':
    'I remember it.',

  'demo-blk-44':
    "Yakov closed his eyes. The priest came in the evening. Yakov died before morning.",

  'demo-blk-45':
    "Rothschild kept the fiddle. He put the flute aside — he had played it for twenty years and did not touch it again — and he learned to play the tune Yakov had taught him on the last day of Yakov's life. The people of the town, hearing it, said that it was the most beautiful thing they had ever heard: a tune that sounded, all at once, like weeping and like consolation. They asked him to play it at every wedding. He played it. He never explained where he had learned it.",

  'demo-blk-46':
    "And the tune went on.",

  'demo-blk-gr2':
    "(Yakov's last thought, had he kept it, would have been of the half rouble he had never set aside for a coffin of his own.)",
};
