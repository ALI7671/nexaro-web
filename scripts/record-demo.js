// Records a promo video of the Nexaro site for Instagram Reels (1080x1920)
// and Facebook (1920x1080).
//
//   npm run demo:record                          both versions
//   node scripts/record-demo.js --only=vertical  just the Reel
//   node scripts/record-demo.js --fps=60         smoother, twice as many frames
//
// Why not Playwright's built-in video recording (recordVideo)?
// It captures in real time into a low-bitrate VP8 WebM, so text comes out soft at
// 1080x1920 and motion stutters whenever the machine is busy. Instead, this script
// renders the video frame by frame:
//   1. Every CSS animation and transition on the page is paused, and moved forward by
//      exactly one frame (1/30 s) before each screenshot. Scrolling and typing are also
//      driven one frame at a time. So motion is perfectly even, however long a frame takes.
//   2. Each frame is a full-resolution screenshot: a 360x640 phone screen at 3x pixel
//      density = 1080x1920 real pixels (and 1280x720 at 1.5x = 1920x1080).
//   3. Frames are piped into ffmpeg and encoded as high-quality H.264 MP4.

const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const { once } = require('events');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VIDEO_DIR = path.join(ROOT, 'videos');
const BASE_URL = (process.env.DEMO_URL || 'http://localhost:3000').replace(/\/$/, '');

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));
const FPS = Number(args.fps) || 30;

const FORMATS = {
  vertical: {
    file: 'nexaro-demo.mp4',
    mobile: true,
    context: {
      ...devices['Pixel 5'],
      viewport: { width: 360, height: 640 },
      deviceScaleFactor: 3, // → 1080x1920
    },
  },
  horizontal: {
    file: 'nexaro-demo-horizontal.mp4',
    mobile: false,
    context: {
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1.5, // → 1920x1080
    },
  },
};

/* ---------- Easing ---------- */

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

/* ---------- Runs inside every page the recorder opens ---------- */

function pageHelpers() {
  // Moves every animation forward by `ms`. A newly found animation is paused and
  // restarted from 0, so it plays at video speed from its first frame.
  window.__demoStep = (ms) => {
    for (const animation of document.getAnimations()) {
      if (!animation.__demo) {
        animation.__demo = true;
        animation.pause();
        animation.currentTime = 0;
      } else {
        animation.currentTime += ms;
      }
    }
  };

  // A soft ripple where the "finger" taps, in the brand's text color
  window.__demoTap = (x, y) => {
    const dot = document.createElement('div');
    dot.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:46px;height:46px;margin:-23px 0 0 -23px;
      border-radius:50%;background:rgba(220,217,212,.28);border:1px solid rgba(220,217,212,.75);
      pointer-events:none;z-index:2147483647`;
    document.documentElement.appendChild(dot);
    dot.animate([
      { transform: 'scale(.4)', opacity: 0 },
      { transform: 'scale(1)', opacity: 1, offset: 0.3 },
      { transform: 'scale(1.5)', opacity: 0 },
    ], { duration: 700, easing: 'ease-out', fill: 'both' });
  };

  window.__demoFadeOut = (ms) => {
    const cover = document.createElement('div');
    cover.style.cssText = 'position:fixed;inset:0;background:#0A0909;pointer-events:none;z-index:2147483647';
    document.documentElement.appendChild(cover);
    cover.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease-in-out', fill: 'both' });
  };
}

/* ---------- Recorder: one method call = one piece of the video ---------- */

class Recorder {
  constructor(page, encoder, { mobile }) {
    this.page = page;
    this.encoder = encoder;
    this.mobile = mobile;
    this.frameMs = 1000 / FPS;
    this.frames = 0;
  }

  get seconds() {
    return this.frames / FPS;
  }

  // Captures one video frame. `update` runs first (e.g. scroll a little).
  async frame(update) {
    if (update) await update();
    await this.page.evaluate((ms) => window.__demoStep(ms), this.frameMs);
    const image = await this.page.screenshot({ type: 'jpeg', quality: 100, caret: 'initial' });
    if (!this.encoder.stdin.write(image)) await once(this.encoder.stdin, 'drain');
    this.frames += 1;
    if (this.frames % FPS === 0) process.stdout.write(`\r  ${this.seconds.toFixed(0)}s recorded`);
  }

  async hold(seconds) {
    const count = Math.round(seconds * FPS);
    for (let i = 0; i < count; i += 1) await this.frame();
  }

  async goto(urlPath) {
    await this.page.goto(BASE_URL + urlPath);
    await this.waitReady();
  }

  // Waits until translations, fonts and images are in, so nothing pops in mid-video
  async waitReady() {
    await this.page.waitForFunction(() => document.documentElement.classList.contains('is-ready'));
    await this.page.evaluate(async () => {
      document.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => (img.complete
        ? null
        : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; }))));
    });
  }

  async scrollY() {
    return this.page.evaluate(() => window.scrollY);
  }

  // Eased scroll to `y` over `seconds`
  async scrollTo(y, seconds, ease = easeInOutCubic) {
    const from = await this.scrollY();
    const max = await this.page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    const to = Math.max(0, Math.min(y, max));
    if (Math.abs(to - from) < 4) return;
    const count = Math.max(1, Math.round(seconds * FPS));
    for (let i = 1; i <= count; i += 1) {
      const value = from + (to - from) * ease(i / count);
      await this.frame(() => this.page.evaluate((v) => window.scrollTo(0, v), value));
    }
  }

  async scrollBy(distance, seconds, ease) {
    await this.scrollTo((await this.scrollY()) + distance, seconds, ease);
  }

  // Page position that puts the element's top `fraction` of the way down the screen
  async positionOf(selector, fraction = 0) {
    return this.page.evaluate(([sel, f]) => {
      const el = document.querySelector(sel);
      const header = document.getElementById('site-header').offsetHeight;
      const top = el.getBoundingClientRect().top + window.scrollY;
      return top - header - (window.innerHeight - header) * f;
    }, [selector, fraction]);
  }

  // Shows a ripple, taps (or clicks) the element, then keeps recording for `after` seconds.
  // With `navigates`, waits for the next page; with `keepScroll`, the new page opens
  // at the same scroll position (used for the language switch).
  async tap(selector, after = 0.4, { navigates = false, keepScroll = false } = {}) {
    const target = this.page.locator(selector).first();
    let box = await target.boundingBox();
    // Scroll first only if the element is hidden; the sticky header is always on screen
    const hidden = await target.evaluate((el) => {
      if (el.closest('#site-header')) return false;
      const rect = el.getBoundingClientRect();
      const header = document.getElementById('site-header').offsetHeight;
      return rect.top < header || rect.bottom > window.innerHeight;
    });
    if (hidden) {
      await this.scrollBy(box.y - this.page.viewportSize().height * 0.45, 0.8);
      box = await target.boundingBox();
    }
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await this.page.evaluate(([px, py]) => window.__demoTap(px, py), [x, y]);
    await this.hold(0.2);

    const scroll = await this.scrollY();
    const press = () => (this.mobile ? this.page.touchscreen.tap(x, y) : this.page.mouse.click(x, y));
    if (navigates) {
      await Promise.all([this.page.waitForEvent('load'), press()]);
      await this.waitReady();
      if (keepScroll) await this.page.evaluate((v) => window.scrollTo(0, v), scroll);
    } else {
      await press();
    }
    await this.hold(after);
  }

  // Types like a person: one letter at a time, with slightly uneven gaps
  async type(text) {
    const gaps = [0.24, 0.17, 0.28, 0.2, 0.22];
    for (const [i, char] of [...text].entries()) {
      await this.page.keyboard.insertText(char);
      await this.hold(gaps[i % gaps.length]);
    }
  }

  async fadeOut(seconds) {
    await this.page.evaluate((ms) => window.__demoFadeOut(ms), seconds * 1000);
    await this.hold(seconds + 0.1);
  }
}

/* ---------- The scenes ---------- */

async function playScenes(rec) {
  // 1. Home hero: the wordmark and "Wear Your Next" rising in
  await rec.goto('/');
  await rec.hold(2.2);

  // 2. Slow scroll through the featured stores, then the brand story
  await rec.scrollTo(await rec.positionOf('section[aria-labelledby="stores-title"]'), 3.0);
  await rec.hold(0.3);
  await rec.scrollBy((await rec.page.evaluate(() => window.innerHeight)) * 0.8, 2.0, easeInOutSine);
  await rec.scrollTo(await rec.positionOf('section[aria-labelledby="story-title"]'), 1.5);
  await rec.hold(1.1);

  // 3. Live search: type "قميص" and watch the results appear
  await rec.tap('[data-search-open]', 0.35);
  await rec.type('قميص');
  await rec.hold(1.5);

  // 4. Product page: pause, then tap a colour and a few sizes
  await rec.tap('#search-results [role="option"]', 0.7, { navigates: true });
  await rec.scrollTo(await rec.positionOf('.option-group', 0.12), 1.1);
  await rec.tap('input[name="color"] >> nth=1', 0.35);
  for (const size of ['S', 'M', 'L']) {
    await rec.tap(`input[name="size"][value="${size}"]`, 0.35);
  }
  await rec.hold(0.3);

  // 5. Switch to English and back to Arabic, staying on the same view
  await rec.tap('.lang-btn', 1.4, { navigates: true, keepScroll: true });
  await rec.tap('.lang-btn', 0.8, { navigates: true, keepScroll: true });

  // 6. End on the home hero
  await rec.tap('.site-header .logo', 2.3, { navigates: true });
  await rec.fadeOut(0.5);
}

/* ---------- Encoding ---------- */

function ffmpegBinary() {
  try {
    const binary = require('ffmpeg-static');
    if (binary && fs.existsSync(binary)) return binary;
  } catch {
    // not installed: fall back to an ffmpeg on the PATH
  }
  return 'ffmpeg';
}

// Output that plays on iPhone and uploads to Instagram/Facebook:
// H.264 High profile at Level 4.1 (iPhones officially decode up to 4.2; left alone,
// x264 picks Level 5.0 for these settings, which iOS can refuse), yuv420p, CRF 18,
// MP4 with the index at the front (+faststart). The video has no sound, so no audio track.
function startEncoder(file) {
  const ffmpeg = spawn(ffmpegBinary(), [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    // Screenshots are full-range JPEG; convert to standard video range/colors
    '-vf', 'scale=in_range=full:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
    '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p', '-tag:v', 'avc1',
    '-r', String(FPS),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart',
    file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const done = new Promise((resolve, reject) => {
    ffmpeg.on('error', (error) => reject(new Error(
      `Could not start ffmpeg (${error.message}). Run "npm install" again, or install ffmpeg and add it to your PATH.`,
    )));
    ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))));
  });
  return { stdin: ffmpeg.stdin, done };
}

/* ---------- Site server ---------- */

function isUp(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => { res.resume(); resolve(true); }).on('error', () => resolve(false));
  });
}

// Uses the site if it's already running; otherwise starts server.js for the recording
async function ensureServer() {
  if (await isUp(BASE_URL)) return null;
  const url = new URL(BASE_URL);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`${BASE_URL} is not reachable.`);
  }
  console.log(`Starting the site at ${BASE_URL}`);
  const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: url.port || '80' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i += 1) {
    if (await isUp(BASE_URL)) return server;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  server.kill();
  throw new Error('The site did not start. Try "npm start" in another terminal first.');
}

/* ---------- Main ---------- */

async function record(browser, name) {
  const format = FORMATS[name];
  const output = path.join(VIDEO_DIR, format.file);
  console.log(`\nRecording ${name} → videos/${format.file}`);

  const context = await browser.newContext({ ...format.context, colorScheme: 'dark' });
  await context.addInitScript(pageHelpers);
  const page = await context.newPage();
  const encoder = startEncoder(output);
  const recorder = new Recorder(page, encoder, format);

  try {
    await playScenes(recorder);
  } finally {
    encoder.stdin.end();
    await context.close();
  }
  await encoder.done;
  console.log(`\r  Done: ${recorder.seconds.toFixed(1)}s, ${recorder.frames} frames at ${FPS} fps`);
}

async function main() {
  const names = args.only ? [args.only] : Object.keys(FORMATS);
  for (const name of names) {
    if (!FORMATS[name]) throw new Error(`Unknown format "${name}". Use: ${Object.keys(FORMATS).join(', ')}`);
  }
  fs.mkdirSync(VIDEO_DIR, { recursive: true });

  const server = await ensureServer();
  const browser = await chromium.launch({ args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
  try {
    for (const name of names) await record(browser, name);
  } finally {
    await browser.close();
    server?.kill();
  }
  console.log('\nVideos saved in videos/');
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
