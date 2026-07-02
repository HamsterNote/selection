import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EVIDENCE_DIR = '.omo/evidence';
const URL = 'http://127.0.0.1:9536';

function startDevServer() {
  return spawn('npm', ['run', 'dev'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

async function main() {
  console.log('Starting dev server...');
  const server = startDevServer();

  try {
    await waitForServer(URL);
    console.log('Server ready at', URL);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(URL);
    await sleep(1000);

    // Show legacy panel
    const legacyToggle = page.locator('label:has-text("显示 legacy 兼容面板") input[type="checkbox"]').first();
    await legacyToggle.check();
    await sleep(500);

    // Locate the legacy panel container (now the third .hsn-selection-container on the page, after page-a and page-b)
    const legacyPanel = page.locator('.hsn-selection-container').nth(2);
    await legacyPanel.scrollIntoViewIfNeeded();
    await sleep(500);

    const panelBox = await legacyPanel.boundingBox();
    if (!panelBox) throw new Error('Could not find legacy panel');

    // S1: active selection popover hides during drag-select and reappears after mouseup
    const startX = panelBox.x + 20;
    const startY = panelBox.y + 20;
    const endX = panelBox.x + panelBox.width - 20;
    const endY = panelBox.y + 40;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await sleep(200);
    await page.screenshot({ path: `${EVIDENCE_DIR}/popover-hide-active-during-drag.png` });
    console.log('Screenshot during drag:', `${EVIDENCE_DIR}/popover-hide-active-during-drag.png`);

    await page.mouse.up();
    await sleep(500);
    await page.screenshot({ path: `${EVIDENCE_DIR}/popover-hide-active-after-mouseup.png` });
    console.log('Screenshot after mouseup:', `${EVIDENCE_DIR}/popover-hide-active-after-mouseup.png`);

    // S2: clicking inside popover does not hide it
    const activePopover = legacyPanel.locator('.hsn-selection-popover button:has-text("高亮")').first();
    if (await activePopover.isVisible().catch(() => false)) {
      await activePopover.screenshot({ path: `${EVIDENCE_DIR}/popover-hide-active-popover-button.png` });
      await activePopover.click();
      await sleep(300);
      await page.screenshot({ path: `${EVIDENCE_DIR}/popover-hide-after-popover-click.png` });
      console.log('Popover click screenshots saved');
    }

    // S3: persisted range popover hides during new text-selection drag
    // The previous highlight click may have created a persisted range. Take a screenshot.
    await page.screenshot({ path: `${EVIDENCE_DIR}/popover-hide-persisted-before-drag.png` });

    // Start a new selection drag somewhere else in the panel
    await page.mouse.move(panelBox.x + 20, panelBox.y + panelBox.height - 60);
    await page.mouse.down();
    await page.mouse.move(panelBox.x + panelBox.width - 20, panelBox.y + panelBox.height - 30, { steps: 10 });
    await sleep(200);
    await page.screenshot({ path: `${EVIDENCE_DIR}/popover-hide-persisted-during-drag.png` });
    console.log('Persisted popover during drag screenshot saved');
    await page.mouse.up();

    await browser.close();
    console.log('Manual QA complete. Evidence saved to', EVIDENCE_DIR);
  } finally {
    server.kill('SIGTERM');
    await sleep(1000);
    if (!server.killed) server.kill('SIGKILL');
  }
}

main().catch((err) => {
  console.error('QA failed:', err);
  process.exit(1);
});
