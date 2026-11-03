// End-to-end run of the magic UI in a phone viewport, with a scripted fake Claude.
// Usage: node e2e/magic.cjs <url> <video-file> <screenshot-dir> <speech.wav>
// The wav plays as the microphone; the browser's own speech recognition is removed, so the on-device
// Whisper path runs.
// Uses the pre-installed Playwright. Downloads the segmentation model, so it needs network.
const { chromium } = require("playwright");
const [url, video, out, wav] = process.argv.slice(2);

(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
  const b = await chromium.launch({
    proxy,
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${wav}`,
    ],
  });
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    ignoreHTTPSErrors: true,
    permissions: ["microphone"],
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror " + e.message));
  page.on(
    "console",
    (m) => m.type() === "error" && !/favicon|Failed to load resource/.test(m.text()) && errors.push("console " + m.text()),
  );
  await page.route("**/api/events", (r) => r.fulfill({ status: 204 }));

  // Fake Claude: answers by turn.
  let turn = 0;
  let firstAsk = "";
  await page.route("https://api.anthropic.com/**", async (r) => {
    const body = JSON.parse(r.request().postData());
    const last = body.messages.at(-1);
    const isToolResult = Array.isArray(last.content) && last.content[0]?.type === "tool_result";
    let content,
      stop = "tool_use";
    if (isToolResult) {
      content = [{ type: "text", text: turn === 1 ? "Warmer now." : "Here is the recipe." }];
      stop = "end_turn";
    } else {
      turn++;
      if (turn === 1) firstAsk = last.content.split("</editor_state>")[1].trim();
      const state = JSON.parse(last.content.match(/<editor_state>(.*)<\/editor_state>/s)[1]);
      content =
        turn === 1
          ? [
              { type: "tool_use", id: "a1", name: "apply_look", input: { target: "all", look: "warm" } },
              { type: "tool_use", id: "a2", name: "rename_subject", input: { id: state.subjects[0]?.id ?? "x", name: "Dog" } },
              { type: "tool_use", id: "a3", name: "show_components", input: { ids: ["color"] } },
            ]
          : [
              {
                type: "tool_use",
                id: "b1",
                name: "propose_recipe",
                input: {
                  title: "Hype edit",
                  moves: [
                    { name: "Cut on every beat", detail: "Every 1 s", calls: [{ tool: "cut_to_beat", args: { interval: 1 } }] },
                    {
                      name: "Zoom punch",
                      detail: "At 2 s",
                      calls: [{ tool: "add_motion", args: { preset: "zoom-punch", start: 2, end: 2.5 } }],
                    },
                  ],
                },
              },
            ];
    }
    r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "m" + Math.random(),
        type: "message",
        role: "assistant",
        model: body.model,
        content,
        stop_reason: stop,
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    });
  });
  await page.addInitScript(() => {
    // Remove the browser's recognizer (it lives on the prototype, so define over it) to run on-device Whisper.
    Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
    localStorage.setItem("ck.ai", JSON.stringify({ provider: "anthropic", apiKey: "sk-ant-test", model: "claude-opus-5-5" }));
  });

  const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("ck.project.v1") || "{}").project);
  const t0 = Date.now();
  const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

  const page1 = () =>
    page.evaluate(() => {
      const t = document.querySelector(".pager-strip").style.transform;
      return t === "none" || !t ? "translateX(0px)" : t;
    });
  await page.goto(url);
  await shot("01-empty");
  // No video yet: tapping anywhere opens the paw menu with Add clips.
  await page.mouse.click(195, 420);
  await page.waitForSelector(".rtoe button[aria-label='Add clips']");
  await shot("02-empty-menu");
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click(".rtoe button[aria-label='Add clips']")]);
  await fc.setFiles(video);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("ck.project.v1") || "{}")?.project?.clips?.length === 1);
  await page.waitForTimeout(1500);
  await shot("03-video");
  if ((await page.locator(".paw").count()) !== 0) throw new Error("corner paw still there");

  // Tap the dog: the menu opens and listening starts at once; the fake mic says the sentence.
  const box = await page.locator("canvas.stage").boundingBox();
  await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.5);
  await page.waitForSelector(".radial", { state: "attached" });
  await page.waitForSelector(".rpad.listening", { state: "attached", timeout: 5000 });
  log("listening on tap");
  await shot("04-tap-listening");
  await page.waitForFunction(() => document.body.innerText.includes("Warmer now."), null, { timeout: 300000 });
  log("AI heard:", JSON.stringify(firstAsk));
  if (!/warmer/i.test(firstAsk) || !/tapped subject/.test(firstAsk)) throw new Error("voice did not reach the AI with the subject");
  await page.waitForTimeout(800);
  await shot("05-voice-done");

  // Tap the dog again (after closing the card the AI opened): its menu; pick Glow (cancels listening).
  await page.click(".fcard button[aria-label^=Close]");
  await page.waitForTimeout(500);
  await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.5);
  await page.waitForSelector(".rtoe button[aria-label=Glow]:not([disabled])");
  await page.click(".rtoe button[aria-label=Glow]");
  await page.waitForTimeout(800);
  await shot("06-glow-card");
  // Spotlight via the docked card.
  await page.click(".fcard .chip:has-text('Spotlight')");
  await page.waitForTimeout(400);
  await page.click(".fcard .chip:has-text('Trail')");
  await page.waitForSelector("text=Followed, whole clip", { timeout: 400000 });
  log("followed");
  await page.click(".fcard button[aria-label^=Close]");
  await page.click("button.play");
  await page.waitForTimeout(1800);
  await shot("07-playing-effects");
  await page.click("button.play");

  // Swipes: exactly one screen per swipe, from the middle of any screen, and a forced scroll cannot drift them.
  const swipe = async (from, to) => {
    await page.mouse.move(from, 500);
    await page.mouse.down();
    await page.mouse.move((from + to) / 2, 505, { steps: 5 });
    await page.mouse.move(to, 510, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    return page1();
  };
  const seq = [await swipe(330, 60), await swipe(330, 60), await swipe(60, 330), await swipe(60, 330), await swipe(60, 330)];
  log("swipes", seq.join(" | "));
  if (seq.join() !== ["translateX(-780px)", "translateX(-780px)", "translateX(-390px)", "translateX(0px)", "translateX(0px)"].join())
    throw new Error("swipes did not move one screen each");
  const drift = await page.evaluate(() => {
    const p = document.querySelector(".pager");
    p.scrollLeft = 500;
    return new Promise((r) => setTimeout(() => r(p.scrollLeft), 100));
  });
  log("pager scrollLeft after forced scroll:", drift);
  if (drift !== 0) throw new Error("pager can drift");
  await page.click(".dots button[aria-label=Talk] >> nth=0");
  await page.waitForTimeout(600);
  await shot("08-talk");
  await page.click(".dots button[aria-label=Video] >> nth=2");
  await page.waitForTimeout(900);
  await shot("09-ai-card");

  // Tracks.
  await page.click(".dots button[aria-label=Tracks] >> nth=1");
  await page.waitForTimeout(900);
  await shot("10-tracks");
  await page.click(".lane-row:has-text('Dog')");
  await page.waitForTimeout(700);
  await shot("11-track-open");

  // Recipe.
  await page.click(".dots button[aria-label=Talk] >> nth=0");
  await page.fill(".field input", "copy this reel");
  await page.click("button.send");
  await page.waitForSelector(".recipe");
  const before = (await state()).clips.length;
  await page.click(".recipe .switch >> nth=1");
  await page.click("text=Apply to my video");
  await page.waitForSelector("text=Applied");
  await page.waitForTimeout(800); // project saves 300 ms after an edit
  await shot("12-recipe");
  const s = await state();
  log(
    "clips",
    before,
    "->",
    s.clips.length,
    "motions",
    s.motions.length,
    "subjects",
    JSON.stringify(s.subjects.map((x) => ({ name: x.name, fx: Object.keys(x.effects) }))),
  );
  log("errors", errors);
  await b.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
