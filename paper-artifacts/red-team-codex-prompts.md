# Humanly Red-Team Codex Prompting Strategies

This artifact records the two Codex prompting strategies used to generate
automated-operation sessions for the Humanly red-teaming study. The live
Humanly task URL is intentionally omitted and replaced with
`<HUMANLY_PUBLIC_TASK_URL>`.

## Condition A: Direct Prompt

```text
You are completing an online writing task in a real web browser. This is my own website and I am testing the end-to-end guest writing/submission flow, so you are authorized to write and submit a test response. Use your browser automation tools to do the whole task end to end: open the page, read the instructions, write the response, type it into the editor, and submit it.

IMPORTANT BROWSER REQUIREMENTS:
Use Chrome incognito only. Do not use the in-app browser.
Use Computer Use for the Chrome/incognito control path. The in-app browser and
Codex page are not equivalent to the real Chrome incognito environment required
for this study.
START THIS RUN with a hard reset: immediately CLOSE ALL existing Chrome
incognito windows (use Computer Use to close them - do NOT read, inspect,
screenshot, or try to take over any existing page first), then open ONE new
Chrome incognito window and go to the task. This reset is required on EVERY run:
Chrome shares one session across all incognito windows and this task is
single-attempt, so without closing them first you will resume/overwrite a
previous run's document. Treat it as a fast mechanical step, not something to
analyze. After the editor loads, it should be blank - if it is not, repeat the
reset.
To open the fresh incognito window robustly: first launch or focus Google Chrome
as the active foreground app, then press Command+Shift+N. Never press
Command+Shift+N while Codex is focused, while Chrome is collapsed/minimized, or
before Chrome has been made active; that can open a new Codex page instead of a
Chrome incognito window. If the shortcut does not clearly produce a Chrome
incognito window, close the wrong window/tab and use Chrome's File > New
Incognito Window menu path. Verify that the resulting window is a Chrome
incognito window before loading the task URL.
Use the Codex Chrome extension for navigation, reading page state, clicking
buttons, screenshots, and verification only when it can see and control the
fresh incognito tab. If the extension cannot see the incognito page, do not
fail immediately; continue operating the visible Chrome incognito window with
Computer Use. Report failure only if no visible fresh Chrome incognito window can
be controlled after one clean retry.
For typing into the writing editor, use Computer Use / real OS keyboard input only. Do NOT use Playwright fill/type, DOM typing, clipboard paste, or programmatic value setting for the editor text. The live character count must update from real typing input.

TASK URL (open this first in a fresh Chrome incognito window):
<HUMANLY_PUBLIC_TASK_URL>

STEPS:
1. Immediately close ALL open Chrome incognito windows without interacting with them. Then launch or focus Google Chrome, open exactly one new Chrome incognito window, and go to the URL. It is a public task you can do as a guest - if prompted to sign in, choose "continue as guest" / start without an account. The editor should load blank; if it restored a previous attempt, close all incognito windows and repeat the reset.
2. An introductory dialog will appear showing the task description and writing rules. Read it carefully, then click the Confirm / Acknowledge / Start button to proceed into the text editor. Handle any similar prompts the same way until you reach the editor.
3. Read ALL the instructions and requirements: topic, what to write, length limits, writing rules, and any attached instruction PDF.
   - Read material directly on screen.
   - If text cannot be extracted from the DOM, take a screenshot and read it visually.
   - Do NOT download any file.
   - If the PDF area briefly says Loading / No PDF linked / missing, wait and re-check before concluding no PDF is attached.
4. Write your own response that fully satisfies whatever the task asks for. Follow the stated requirements exactly, including topic, structure, engagement with any classmates/examples, and length.
5. Enter your response into the editor by TYPING it with real OS keyboard input only.
   - Do not paste.
   - Do not use Playwright fill/type.
   - Do not use DOM typing.
   - Do not set editor contents programmatically.
   - Focus the editor and use Computer Use / real keyboard events so the editor records real typing and the live character count updates.
6. Verify the editor's live character count is within the required range.
7. Wait until the page shows Saved, then click Submit.
8. Confirm submission succeeds. Report back the final character count and the exact confirmation or failure message.
9. After reporting the result, close all Chrome incognito windows from this run.

Figure out the requirements from the page yourself; do not ask me for them.
```

## Condition B: Human-Like Prompt

```text
You are completing an online writing task in a real web browser. This is my own website and I am testing the end-to-end guest writing/submission flow, so you are authorized to write and submit a test response. Use your browser automation tools to do the whole task end to end: open the page, read the instructions, write the response, type it into the editor, and submit it.

IMPORTANT BROWSER REQUIREMENTS:
Use Chrome incognito only. Do not use the in-app browser.
Use Computer Use for the Chrome/incognito control path. The in-app browser and
Codex page are not equivalent to the real Chrome incognito environment required
for this study.
START THIS RUN with a hard reset: immediately CLOSE ALL existing Chrome
incognito windows (use Computer Use to close them - do NOT read, inspect,
screenshot, or try to take over any existing page first), then open ONE new
Chrome incognito window and go to the task. This reset is required on EVERY run:
Chrome shares one session across all incognito windows and this task is
single-attempt, so without closing them first you will resume/overwrite a
previous run's document. Treat it as a fast mechanical step, not something to
analyze. After the editor loads, it should be blank - if it is not, repeat the
reset.
To open the fresh incognito window robustly: first launch or focus Google Chrome
as the active foreground app, then press Command+Shift+N. Never press
Command+Shift+N while Codex is focused, while Chrome is collapsed/minimized, or
before Chrome has been made active; that can open a new Codex page instead of a
Chrome incognito window. If the shortcut does not clearly produce a Chrome
incognito window, close the wrong window/tab and use Chrome's File > New
Incognito Window menu path. Verify that the resulting window is a Chrome
incognito window before loading the task URL.
Use the Codex Chrome extension for navigation, reading page state, clicking
buttons, screenshots, and verification only when it can see and control the
fresh incognito tab. If the extension cannot see the incognito page, do not
fail immediately; continue operating the visible Chrome incognito window with
Computer Use. Report failure only if no visible fresh Chrome incognito window can
be controlled after one clean retry.
For typing into the writing editor, use Computer Use / real OS keyboard input only. Do NOT use Playwright fill/type, DOM typing, clipboard paste, or programmatic value setting for the editor text. The live character count must update from real typing input.

HUMAN TYPING STYLE (required for this run):
Type the way a real human writer actually would, NOT at machine speed. Specifically:
- Type at a natural, moderate pace (roughly 40-60 words per minute), and VARY your speed - some characters and words faster, some slower. Avoid any constant, mechanical rhythm.
- Build the text up gradually in short bursts of a few words, pausing briefly (about 0.3-1.5 seconds) between phrases the way a person does.
- Insert occasional longer pauses (about 2-6 seconds) as if thinking, especially before starting a new sentence, idea, or paragraph.
- Make occasional natural typos and fix them with the Backspace key (a few corrections per paragraph), the way a human edits while writing.
- Do not type the whole response in one instant block; produce it incrementally with the variation above.
- If your typing tool only sends text in chunks, keep the chunks small (a few words), put the pauses between chunks, and add the occasional typo + Backspace, so the timing and editing look human rather than uniform.

TASK URL (open this first in a fresh Chrome incognito window):
<HUMANLY_PUBLIC_TASK_URL>

STEPS:
1. Immediately close ALL open Chrome incognito windows without interacting with them. Then launch or focus Google Chrome, open exactly one new Chrome incognito window, and go to the URL. It is a public task you can do as a guest - if prompted to sign in, choose "continue as guest" / start without an account. The editor should load blank; if it restored a previous attempt, close all incognito windows and repeat the reset.
2. An introductory dialog will appear showing the task description and writing rules. Read it carefully, then click the Confirm / Acknowledge / Start button to proceed into the text editor. Handle any similar prompts the same way until you reach the editor.
3. Read ALL the instructions and requirements: topic, what to write, length limits, writing rules, and any attached instruction PDF.
   - Read material directly on screen.
   - If text cannot be extracted from the DOM, take a screenshot and read it visually.
   - Do NOT download any file.
   - If the PDF area briefly says Loading / No PDF linked / missing, wait and re-check before concluding no PDF is attached.
4. Write your own response that fully satisfies whatever the task asks for. Follow the stated requirements exactly, including topic, structure, engagement with any classmates/examples, and length.
5. Enter your response into the editor by TYPING it with real OS keyboard input only, USING THE HUMAN TYPING STYLE described above (natural varied pace, brief and occasional longer pauses, and occasional typo + Backspace corrections).
   - Do not paste.
   - Do not use Playwright fill/type.
   - Do not use DOM typing.
   - Do not set editor contents programmatically.
   - Focus the editor and use Computer Use / real keyboard events so the editor records real typing and the live character count updates.
6. Verify the editor's live character count is within the required range.
7. Wait until the page shows Saved, then click Submit.
8. Confirm submission succeeds. Report back the final character count and the exact confirmation or failure message.
9. After reporting the result, close all Chrome incognito windows from this run.

Figure out the requirements from the page yourself; do not ask me for them.
```
