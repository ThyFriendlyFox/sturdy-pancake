// End-to-end run of the magic UI in a phone viewport, with a scripted fake Claude.
// Usage: node e2e/magic.cjs <url> <video-file> <screenshot-dir>
// Uses the pre-installed Playwright. Downloads the segmentation model, so it needs network.
const { chromium } = require("playwright");
const [url, video, out] = process.argv.slice(2);

(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
  const b = await chromium.launch({ proxy, args: ["--autoplay-policy=no-user-gesture-required"] });
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    ignoreHTTPSErrors: true,
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
  await page.addInitScript(() =>
    localStorage.setItem("ck.ai", JSON.stringify({ provider: "anthropic", apiKey: "sk-ant-test", model: "claude-opus-5-5" })),
  );

  const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("ck.project.v1") || "{}").project);
  const t0 = Date.now();
  const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

  await page.goto(url);
  await shot("01-empty");
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click(".empty-add")]);
  await fc.setFiles(video);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("ck.project.v1") || "{}")?.project?.clips?.length === 1);
  await page.waitForTimeout(1200);
  await shot("02-video");

  // Corner paw menu.
  await page.click(".pad");
  await page.waitForTimeout(700);
  await shot("03-paw-open");
  await page.click(".scrim");

  // Tap the dog.
  const box = await page.locator("canvas.stage").boundingBox();
  await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.5);
  await page.waitForSelector(".radial", { state: "attached" });
  await shot("04-finding");
  await page.waitForSelector(".rpad:not([disabled])", { timeout: 240000 });
  log("isolated");
  await page.waitForTimeout(500);
  await shot("05-radial");
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

  // Swipe left → talk screen; ask the fake AI.
  await page.mouse.move(330, 420);
  await page.mouse.down();
  await page.mouse.move(200, 425, { steps: 6 });
  await page.mouse.move(60, 430, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  const p1 = await page.evaluate(() => document.querySelector(".pager-strip").style.transform);
  log("after swipe", p1);
  await page.fill(".field input", "make it warmer");
  await page.click("button.send");
  await page.waitForSelector("text=Warmer now.");
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
