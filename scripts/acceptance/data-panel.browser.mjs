import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const evidence = resolve(process.env.ACCEPTANCE_EVIDENCE ?? '');
assert(process.env.ACCEPTANCE_EVIDENCE && relative(root, evidence).startsWith('..'), 'Evidence must be outside the repository.');
assert(process.env.PLAYWRIGHT_MODULE, 'Provide the isolated Playwright module path.');
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
await mkdir(evidence, { recursive: true });
const report = { sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), browserPath: 'Playwright CI fallback; Codex Browser plugin is not available on the runner', results: [], consoleErrors: [], requestFailures: [] };
const origin = 'http://localhost:5179';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'acceptance', '--host', 'localhost', '--port', '5179', '--strictPort'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
for (const stream of [server.stdout, server.stderr]) stream.on('data', (data) => { void appendFile(join(evidence, 'vite.log'), data); });
let browser;
let page;
const pause = (ms) => new Promise((yes) => setTimeout(yes, ms));
async function openControls() {
  const panel = page.locator('.sidepanel');
  const toggle = page.locator('.sidepanel-toggle').first();
  // Narrow layouts show the cards directly and intentionally hide this toggle.
  if ((await panel.getAttribute('class')).includes('collapsed') && await toggle.isVisible()) await toggle.click();
}
async function openData() {
  await openControls();
  const toggle = page.locator('.sidebar-disclosure-toggle').filter({ has: page.locator('.sidebar-disclosure-title', { hasText: /^Data$/ }) });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  const data = page.locator('.sidebar-disclosure').filter({ has: page.locator('.sidebar-disclosure-title', { hasText: /^Data$/ }) });
  const advanced = data.locator('details[aria-label="Advanced data actions"]');
  if (await advanced.getAttribute('open') === null) await advanced.locator('summary').click();
  await pause(800);
  return data;
}
async function metrics(data) {
  return data.evaluate((element) => {
    const box = element.getBoundingClientRect(); const panel = element.closest('.sidepanel');
    return { disclosureHeight: box.height, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, flexShrink: getComputedStyle(element).flexShrink, sidebarClientHeight: panel.clientHeight, sidebarScrollHeight: panel.scrollHeight, sidebarScrollTop: panel.scrollTop };
  });
}
async function pointer(locator, activate = true) {
  await locator.scrollIntoViewIfNeeded();
  const bounds = await locator.boundingBox(); assert(bounds && bounds.width > 0 && bounds.height > 0, 'Control needs usable bounds.');
  assert(await locator.evaluate((element) => {
    const r = element.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return hit === element || element.contains(hit);
  }), 'Control center must receive pointer input, not a clipping ancestor or overlay.');
  if (activate) await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
}
async function task(title) {
  await openControls();
  const input = page.getByRole('textbox', { name: 'Task title', exact: true });
  await input.fill(title); await input.press('Enter');
  await page.getByText(title, { exact: true }).waitFor();
}
try {
  let ready = false;
  for (let i = 0; i < 100; i += 1) { try { if ((await fetch(origin)).ok) { ready = true; break; } } catch {} await pause(100); }
  assert(ready, 'Vite did not start.');
  browser = await chromium.launch(); report.browserVersion = browser.version();
  for (const [width, height] of [[1280, 720], [1440, 900], [960, 640], [700, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
    page = await context.newPage(); page.setDefaultTimeout(12000);
    page.on('pageerror', (error) => report.consoleErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    page.on('requestfailed', (request) => report.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
    await page.goto(`${origin}/acceptance/storage-fault.html`);
    await page.locator('.app-shell').waitFor();
    assert.equal(await page.locator('vite-error-overlay').count(), 0);
    let data = await openData();
    if (width === 1280) {
      const oldRule = await page.addStyleTag({ content: '.sidepanel > .sidebar-disclosure { flex: 0 1 auto !important; }' });
      await pause(500);
      report.negativeControl = await metrics(data);
      await page.screenshot({ path: join(evidence, 'data-before-negative-control.png') });
      assert(report.negativeControl.scrollHeight > report.negativeControl.clientHeight + 2, 'Old flex behavior must reproduce clipping.');
      await oldRule.evaluate((element) => element.remove()); await pause(500);
    }
    const initial = JSON.parse(await page.locator('#persisted-evidence').textContent());
    await page.locator('#arm-failure').click();
    const title = `Pointer retry ${width}`; await task(title);
    await page.getByText('Storage save failed', { exact: true }).waitFor();
    const failed = JSON.parse(await page.locator('#persisted-evidence').textContent());
    assert.deepEqual(failed.durable, initial.durable);
    const dimensions = await metrics(data);
    assert.equal(dimensions.flexShrink, '0');
    assert(dimensions.scrollHeight <= dimensions.clientHeight + 2, 'Data disclosure must not hide vertically overflowing controls.');
    await pointer(page.getByRole('button', { name: 'Retry save', exact: true }), false);
    await page.screenshot({ path: join(evidence, `data-error-${width}.png`) });
    await pointer(page.getByRole('button', { name: 'Retry save', exact: true }));
    await page.getByText('Storage saved', { exact: true }).waitFor();
    const saved = JSON.parse(await page.locator('#persisted-evidence').textContent());
    assert(saved.durable.tasks.some((item) => item.title === title));
    await pointer(page.getByRole('button', { name: 'Restore from JSON backup', exact: true }), false);
    await page.screenshot({ path: join(evidence, `data-recovered-${width}.png`) });

    // The normal browser adapter proves real Restore/Undo; the fault host does not simulate them.
    await page.goto(origin); await page.locator('.app-shell').waitFor();
    const previousTitle = `Before restore ${width}`; await task(previousTitle);
    data = await openData();
    const chooserPromise = page.waitForEvent('filechooser');
    await pointer(page.getByRole('button', { name: 'Restore from JSON backup', exact: true }));
    await (await chooserPromise).setFiles({ name: 'synthetic-all-data.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(initial.durable)) });
    await pointer(page.getByRole('button', { name: 'Confirm restore', exact: true }));
    await page.getByText(previousTitle, { exact: true }).waitFor({ state: 'hidden' });
    await pointer(page.getByRole('button', { name: 'Undo restore', exact: true }));
    await page.getByText(previousTitle, { exact: true }).waitFor();
    report.results.push({ viewport: { width, height }, result: 'PASS', dimensions, pointerRetry: true, pointerRestore: true, pointerUndo: true });
    await context.close(); page = null;
  }
  assert.equal(report.consoleErrors.length, 0, 'Unexpected browser runtime errors.');
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL'; report.error = error.stack ?? String(error);
  if (page && !page.isClosed()) { await page.screenshot({ path: join(evidence, 'failure.png') }).catch(() => undefined); await writeFile(join(evidence, 'failure-dom.txt'), await page.locator('body').innerText().catch(() => '')); }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await writeFile(join(evidence, 'data-panel-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
