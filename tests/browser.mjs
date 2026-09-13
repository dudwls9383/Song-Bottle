import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import express from 'express';
import path from 'node:path';

// 별도 메모리 DB로 브라우저를 검증하므로 사용자의 실제 기록은 건드리지 않습니다.
const store = createStore();
const app = createApp(store);
app.use(express.static(path.resolve('dist')));
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
mkdirSync('.artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  const a = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const b = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const first = await a.newPage(),
    second = await b.newPage();
  for (const p of [first, second]) p.on('pageerror', (error) => errors.push(error.message));
  await first.goto(base);
  await first.getByRole('heading', { name: '노래 보내기' }).waitFor();
  assert.equal(
    await first
      .locator('.bottle-illustration')
      .evaluate((img) => img.complete && img.naturalWidth > 0),
    true,
  );
  await first.screenshot({ path: '.artifacts/desktop-home.png', fullPage: true });
  await second.goto(base);
  await second.getByRole('heading', { name: '노래 보내기' }).waitFor();
  await second.screenshot({ path: '.artifacts/mobile-home.png', fullPage: true });
  for (const p of [first, second])
    assert.ok(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      '가로 넘침 없음',
    );

  await first.getByRole('button', { name: '보틀 띄우기', exact: true }).click();
  await first.getByRole('alert').filter({ hasText: 'URL' }).waitFor();
  await first.getByLabel('노래 링크').fill('https://www.youtube.com/watch?v=jfKfPfyJRdk');
  await first.getByLabel('곡 제목').fill('조용한 밤의 플레이리스트');
  await first.getByRole('button', { name: '밤', exact: true }).click();
  await first.getByLabel('함께 보내는 한마디').fill('오늘도 수고했어요');
  await first.getByRole('button', { name: '보틀 띄우기', exact: true }).click();
  await first.getByRole('heading', { name: /흘러가고/ }).waitFor();
  await second
    .getByLabel('노래 링크')
    .fill('https://open.spotify.com/track/6hxWSCuxxpsicHtEUYj5o1');
  await second.getByLabel('곡 제목').fill('sekisei inko - kurayamisaka');
  await second.getByRole('button', { name: '밤', exact: true }).click();
  await second.getByLabel('함께 보내는 한마디').fill('이 밤에 어울리는 곡');
  await second.getByRole('button', { name: '보틀 띄우기', exact: true }).click();
  await first.getByRole('dialog').waitFor({ timeout: 12000 });
  await second.getByRole('dialog').waitFor({ timeout: 12000 });
  await first.getByRole('dialog').getByRole('link', { name: 'Spotify에서 듣기' }).waitFor();
  await second.getByRole('dialog').getByRole('link', { name: 'YouTube에서 듣기' }).waitFor();
  await second.screenshot({ path: '.artifacts/mobile-exchange.png', fullPage: true });
  await first.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
  await first.reload();
  await first.getByRole('navigation').getByRole('button', { name: '교환 기록' }).click();
  await first.getByText('교환 완료', { exact: true }).last().waitFor();
  await first.screenshot({ path: '.artifacts/desktop-history.png', fullPage: true });
  await first.getByRole('navigation').getByRole('button', { name: '플레이리스트' }).click();
  await first.getByText('2곡', { exact: true }).waitFor();
  await first.getByRole('button', { name: '받은 곡', exact: true }).click();
  await first.getByText('1곡', { exact: true }).waitFor();
  await first.getByRole('button', { name: /sekisei.*즐겨찾기/ }).click();
  await first.getByRole('button', { name: '즐겨찾기만 보기' }).click();
  await first.getByText('1곡', { exact: true }).waitFor();
  const download = first.waitForEvent('download');
  await first.getByRole('button', { name: '플레이리스트 다운로드' }).click();
  assert.equal((await download).suggestedFilename(), 'song-bottle-playlist.txt');
  await second.getByRole('button', { name: '신고하기', exact: true }).click();
  await second.getByRole('button', { name: '신고하고 숨기기' }).click();
  await second.getByText('신고한 보틀은 숨겼어요.', { exact: true }).waitFor();
  await second.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
  await second.getByRole('navigation').getByRole('button', { name: '설정', exact: true }).click();
  await second.getByRole('button', { name: '이용 안내' }).click();
  await second.getByRole('button', { name: '다음', exact: true }).click();
  await second.getByRole('button', { name: '다음', exact: true }).click();
  await second.getByRole('button', { name: '시작하기' }).click();
  await second.screenshot({ path: '.artifacts/mobile-settings.png', fullPage: true });
  await second.getByRole('navigation').getByRole('button', { name: '홈', exact: true }).click();
  for (const width of [320, 375, 768, 1024]) {
    await first.setViewportSize({ width, height: 900 });
    await first.getByRole('navigation').getByRole('button', { name: '홈', exact: true }).click();
    assert.ok(
      await first.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${width}px 가로 넘침 없음`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: desktop/mobile, actual two-user exchange, reload, history, playlist filters, favorites, download, report, onboarding, responsive widths, no browser errors.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
}
