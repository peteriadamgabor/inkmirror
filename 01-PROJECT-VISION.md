# StoryForge — Project Vision

> **Two hearts, one soul.**
> Every novel has two heartbeats. One is the writer's — the rhythm of words being born. The other is the story's — the pulse of the plot, the emotional heartbeat of the characters. StoryForge is the first tool that hears both.

---

## What is this?

StoryForge is a next-generation, AI-assisted novel writing web application. Offline-first, block-based editor, which uses local (in-browser) AI to find connections and track characters — with zero server-side data leakage.

## The problem

Traditional web-based text editors (Google Docs, Word Online) collapse under novels of 100,000+ words due to Layout Reflow. Existing writing software (Scrivener) is not web-native, not AI-capable, and does not understand the writer's workflow.

## The solution

A clean, block-based editor that:
- **Does not use Layout Reflow** — Canvas/Wasm-based text measurement with the `pretext` library
- **Virtualizes** — only renders the visible blocks, 60 FPS even at 100,000+ words
- **Runs local AI** — Transformers.js in a Web Worker; the novel never leaves the browser
- **Understands the writer** — dual pulse system: the writer's rhythm + the story's rhythm

---

## Philosophy

### "AI doesn't write for you — it holds a mirror up to you."
StoryForge is not a generative AI tool. It does not write the novel for the user. Instead, it analyzes, reflects, warns, and inspires. Creativity remains with the writer.

### "Two hearts, one soul"
The app measures two parallel pulses:
- **Writer's pulse** (violet, `#7F77DD`): typing rhythm, deletions, pauses, flow states
- **Story's pulse** (coral, `#D85A30`): tension, pacing, emotional intensity, sentence rhythm

This dual metaphor runs through the entire UI, the logo, and the product positioning.

### Privacy promise
The novel never leaves the user's machine unless the user explicitly requests it. Sync is opt-in and E2E encrypted. The server never sees plaintext.

---

## Brand Identity

| Element | Value |
|---------|-------|
| Name | StoryForge |
| Tagline | Two hearts, one soul |
| Primary color (Writer) | Violet — `#7F77DD` |
| Primary color (Story) | Coral — `#D85A30` |
| Visual style | Floating island — standalone, floating panels on a neutral background |
| Typography (UI) | Sans-serif (system font) |
| Typography (editor) | Serif (reader-friendly, literary feel) |
| Logo concept | Two ECG lines, each containing a heart shape, offset from one another |

---

## Target Audience

Primary: novelists (amateur and professional) who:
- Work on 50,000–200,000 word pieces
- Manage multiple characters, threads, locations
- Value privacy (unpublished manuscript!)
- Are open to AI-assisted but not AI-generated workflows

Secondary: screenwriters, creative writing teachers, worldbuilders.

---

## Value Proposition

| The user says | StoryForge's answer |
|---------------|---------------------|
| "Google Docs slows down on my novel" | Canvas-based rendering, virtualization, 60 FPS |
| "I don't want AI to write it for me" | AI analyzes, it does not generate — it holds a mirror |
| "I'm afraid to upload my manuscript" | Everything is local, zero server-side data |
| "I forgot what I wrote about Réka in chapter 3" | Character card system + inconsistency detection |
| "I don't know if my novel's rhythm is good" | Dual pulse + mood heatmap |
| "I deleted a part I actually needed" | Dead Text Graveyard: nothing is ever lost |
