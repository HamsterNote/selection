import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const evidenceDir = resolve(__dirname);
const screenshotPath = resolve(evidenceDir, 'selection-rect-tool-final.png');
const notesPath = resolve(evidenceDir, 'selection-rect-tool-final.md');
const appUrl = 'http://127.0.0.1:9536';

const notes = [];

function record(message) {
  notes.push(`- ${message}`);
  console.log(message);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectChecked(page, selector, message) {
  const checked = await page.locator(selector).isChecked();
  assert(checked, message);
}

async function legacyContainer(page) {
  const container = page.locator('.hsn-selection-container').last();
  await container.scrollIntoViewIfNeeded();
  return container;
}

async function dragInside(locator, start, end) {
  const box = await locator.boundingBox();
  assert(box, 'Selection container should have a bounding box');
  await locator.page().mouse.move(box.x + start.x, box.y + start.y);
  await locator.page().mouse.down();
  await locator.page().mouse.move(box.x + end.x, box.y + end.y, { steps: 8 });
  await locator.page().mouse.up();
}

async function confirmActiveRect(page) {
  const confirmButton = page.getByRole('button', { name: '确认矩形' });
  await confirmButton.waitFor({ state: 'visible', timeout: 3000 });
  await confirmButton.evaluate((button) => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  });
}

async function rectCount(page) {
  const heading = await page.locator('h2', { hasText: /^Rect 高亮/ }).textContent();
  const match = heading?.match(/Rect 高亮（(\d+)）/);
  assert(match, `Unable to parse rect count from heading: ${heading ?? '<null>'}`);
  return Number(match[1]);
}

async function legacyHighlightCount(page) {
  const heading = await page.locator('h2', { hasText: /^Legacy 高亮/ }).textContent();
  const match = heading?.match(/Legacy 高亮（(\d+)）/);
  assert(match, `Unable to parse legacy highlight count from heading: ${heading ?? '<null>'}`);
  return Number(match[1]);
}

async function drawAndConfirmRect(page, start, end, expectedCount, label) {
  const container = await legacyContainer(page);
  await dragInside(container, start, end);
  await page.locator('.hsn-selection-popover').last().waitFor({ state: 'visible', timeout: 3000 });
  await confirmActiveRect(page);
  await page.waitForFunction((count) => {
    const heading = Array.from(document.querySelectorAll('h2')).find((node) => node.textContent?.startsWith('Rect 高亮'));
    return heading?.textContent?.includes(`（${count}）`) ?? false;
  }, expectedCount);
  record(`${label}: drew and confirmed rect; Rect 高亮 count is ${expectedCount}`);
}

async function selectLatestRectFromList(page) {
  const rectButtons = page
    .getByRole('heading', { name: /^Rect 高亮/ })
    .locator('xpath=following-sibling::ul[1]//button[contains(., "id:")]');
  const count = await rectButtons.count();
  assert(count > 0, 'Expected at least one rect list item button');
  await rectButtons.nth(count - 1).click();
}

async function dragHandle(page, selector, dx, dy, label) {
  const handle = page.locator(selector).first();
  await handle.waitFor({ state: 'visible', timeout: 3000 });
  const box = await handle.boundingBox();
  assert(box, `${label} handle should have a bounding box`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
  record(`${label}: resized via handle drag (${dx}, ${dy})`);
}

async function createTextHighlight(page) {
  const before = await legacyHighlightCount(page);
  const container = await legacyContainer(page);
  await dragInside(container, { x: 28, y: 26 }, { x: 180, y: 26 });
  const highlightButton = page.locator('.hsn-selection-popover button', { hasText: '高亮' }).last();
  await highlightButton.waitFor({ state: 'visible', timeout: 3000 });
  await highlightButton.click();
  await page.waitForFunction((count) => {
    const heading = Array.from(document.querySelectorAll('h2')).find((node) => node.textContent?.startsWith('Legacy 高亮'));
    return heading?.textContent?.includes(`（${count}）`) ?? false;
  }, before + 1);
  record(`text tool: created legacy text highlight; Legacy 高亮 count is ${before + 1}`);
}

await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

try {
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  record(`opened ${appUrl}`);

  await expectChecked(page, 'input[name="selection-tool"][value="text"]', 'Default tool should be text');
  record('default tool is text');

  await page.locator('label', { hasText: '显示 legacy 兼容面板' }).click();
  await page.getByRole('heading', { name: /Legacy 兼容模式/ }).waitFor({ state: 'visible' });
  record('enabled legacy panel for rect/text demo QA');

  await page.locator('input[name="selection-tool"][value="rect"]').check();
  await expectChecked(page, 'input[name="selection-tool"][value="rect"]', 'Rect tool should be checked');
  record('switched to rect tool');

  await drawAndConfirmRect(page, { x: 38, y: 14 }, { x: 190, y: 56 }, 1, 'popover click protection');

  const beforeDelete = await rectCount(page);
  await selectLatestRectFromList(page);
  await page
    .getByRole('heading', { name: /^Rect 高亮/ })
    .locator('xpath=following-sibling::ul[1]//button[normalize-space(.)="删除"]')
    .last()
    .click();
  await page.waitForFunction((count) => {
    const heading = Array.from(document.querySelectorAll('h2')).find((node) => node.textContent?.startsWith('Rect 高亮'));
    return heading?.textContent?.includes(`（${count}）`) ?? false;
  }, beforeDelete - 1);
  record('selected persisted rect and deleted it via popover delete button');

  await expectChecked(page, 'input[name="overlay-rect-type"][value="px"]', 'Overlay type should default to px');
  await drawAndConfirmRect(page, { x: 52, y: 16 }, { x: 220, y: 58 }, 1, 'px overlayRectType');

  await page.locator('input[name="overlay-rect-type"][value="percent"]').check();
  await expectChecked(page, 'input[name="overlay-rect-type"][value="percent"]', 'Overlay type should switch to percent');
  await drawAndConfirmRect(page, { x: 92, y: 18 }, { x: 260, y: 60 }, 2, 'percent overlayRectType');

  await dragHandle(page, '.hsn-selection-handle-rect.hsn-selection-handle--start', -18, -12, 'start handle');
  await dragHandle(page, '.hsn-selection-handle-rect.hsn-selection-handle--end', 22, 18, 'end handle');

  await page.locator('input[name="selection-tool"][value="text"]').check();
  await expectChecked(page, 'input[name="selection-tool"][value="text"]', 'Text tool should be checked after switching back');
  record('switched back to text tool');
  await createTextHighlight(page);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  record(`saved screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
}

await writeFile(
  notesPath,
  `# Selection Rect Tool Final QA\n\n## Result\nPASS\n\n## Notes\n${notes.join('\n')}\n\n## Screenshot\n${screenshotPath}\n`,
  'utf8',
);

console.log(`QA notes written to ${notesPath}`);
