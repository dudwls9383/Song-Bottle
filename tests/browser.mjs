import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';
import express from 'express';
import path from 'node:path';

// 별도 메모리 DB로 브라우저를 검증하므로 사용자의 실제 기록은 건드리지 않습니다.
const store = createStore();
const app = createApp(store, {
  lookup: async (url) =>
    url.includes('5qap5aO4i9A')
      ? { url, title: '', artist: '', artwork: '' }
      : {
          url,
          platform: url.includes('spotify') ? 'Spotify' : 'YouTube',
          title: url.includes('spotify') ? 'sekisei inko' : '조용한 밤의 플레이리스트',
          artist: url.includes('spotify') ? '' : '음악 채널',
          artistKind: url.includes('spotify') ? 'artist' : 'channel',
          artwork: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
        },
});
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
  // 외부 이미지 장애와 관계없이 커버 렌더링을 검증합니다. 실제 API 조회는 별도로 확인합니다.
  for (const context of [a, b])
    await context.route('https://i.ytimg.com/**', (route) =>
      route.fulfill({ contentType: 'image/png', body: readFileSync('public/assets/bottle.png') }),
    );
  await first.goto(base);
  await first.getByRole('heading', { name: '노래 보내기' }).waitFor();
  assert.equal(
    await first
      .locator('.ocean-visual .voyage-bottle img')
      .evaluate((img) => img.complete && img.naturalWidth > 0),
    true,
  );
  await first.screenshot({
    path: '.artifacts/desktop-home.png',
    fullPage: true,
    animations: 'disabled',
  });
  await second.goto(base);
  await second.getByRole('heading', { name: '노래 보내기' }).waitFor();
  await second.screenshot({
    path: '.artifacts/mobile-home.png',
    fullPage: true,
    animations: 'disabled',
  });
  for (const p of [first, second])
    assert.ok(
      await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      '가로 넘침 없음',
    );

  await first.getByRole('button', { name: '보틀 띄우기', exact: true }).click();
  await first.getByRole('alert').filter({ hasText: 'URL' }).waitFor();
  await first.getByLabel('노래 링크').fill('https://www.youtube.com/watch?v=jfKfPfyJRdk');
  await first.locator('.metadata-preview').getByText('조용한 밤의 플레이리스트').waitFor();
  await first.getByRole('button', { name: '보틀 띄우기', exact: true }).click();
  await first.getByRole('alert').filter({ hasText: '장르' }).waitFor();
  await first.getByRole('radio', { name: 'J-pop', exact: true }).check();
  await first.getByRole('button', { name: '로즈 보틀', exact: true }).click();
  await first.getByRole('button', { name: '밤', exact: true }).click();
  await first.getByLabel('함께 보내는 한마디').fill('오늘도 수고했어요');
  await first.getByRole('button', { name: '보틀 띄우기', exact: true }).click();
  await first.getByRole('heading', { name: /흘러가고/ }).waitFor();
  await second
    .getByLabel('노래 링크')
    .fill('https://open.spotify.com/track/6hxWSCuxxpsicHtEUYj5o1');
  await second.locator('.metadata-preview').getByText('sekisei inko').waitFor();
  await second.getByRole('radio', { name: 'J-pop', exact: true }).check();
  await second.getByRole('button', { name: '행복', exact: true }).click();
  await second.getByLabel('함께 보내는 한마디').fill('이 밤에 어울리는 곡');
  await second.getByRole('button', { name: '보틀 띄우기', exact: true }).click();
  await first.getByRole('dialog').waitFor({ timeout: 12000 });
  await second.getByRole('dialog').waitFor({ timeout: 12000 });
  await second.locator('.arrival-scene .bottle-rose').waitFor();
  await second.screenshot({ path: '.artifacts/mobile-arrival.png', animations: 'disabled' });
  await first.getByRole('button', { name: '병 편지 열기', exact: true }).click();
  await second.getByRole('button', { name: '병 편지 열기', exact: true }).click();
  await first.getByRole('dialog').getByRole('link', { name: 'Spotify에서 듣기' }).waitFor();
  await second.getByRole('dialog').getByRole('link', { name: 'YouTube에서 듣기' }).waitFor();
  assert.equal(
    await second
      .locator('.cover-large img')
      .evaluate((img) => img.complete && img.naturalWidth > 0),
    true,
  );
  await second.screenshot({ path: '.artifacts/mobile-exchange.png', animations: 'disabled' });
  await first.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
  await first.reload();
  await first.getByRole('navigation').getByRole('button', { name: '교환 기록' }).click();
  await first.getByText('교환 완료', { exact: true }).last().waitFor();
  await first.screenshot({
    path: '.artifacts/desktop-history.png',
    fullPage: true,
    animations: 'disabled',
  });
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
  await first
    .getByRole('navigation')
    .getByRole('button', { name: '모두의 바다', exact: true })
    .click();
  await first.locator('.drifting-news').first().waitFor();
  const beforeMotion = await first
    .locator('.danmaku-track')
    .first()
    .evaluate((el) => getComputedStyle(el).transform);
  await first.waitForTimeout(250);
  assert.notEqual(
    await first
      .locator('.danmaku-track')
      .first()
      .evaluate((el) => getComputedStyle(el).transform),
    beforeMotion,
  );
  await first.getByRole('button', { name: '소식 일시정지' }).click();
  assert.equal(
    await first
      .locator('.danmaku-track')
      .first()
      .evaluate((el) => getComputedStyle(el).animationPlayState),
    'paused',
  );
  await first.screenshot({ path: '.artifacts/desktop-ocean.png' });
  await second.getByRole('button', { name: '신고하기', exact: true }).click();
  await second.getByRole('button', { name: '신고하고 숨기기' }).click();
  await second.getByText('신고한 보틀은 숨겼어요.', { exact: true }).waitFor();
  await second.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
  await second.getByRole('navigation').getByRole('button', { name: '설정', exact: true }).click();
  await second.getByRole('button', { name: '프로필 활짝', exact: true }).click();
  await second.getByRole('button', { name: '프로필 색 로즈', exact: true }).click();
  await second.getByLabel('나의 칭호').selectOption('first');
  await second.getByRole('button', { name: '프로필 저장', exact: true }).click();
  await second.getByRole('status').filter({ hasText: '나만의 리스너' }).waitFor();
  assert.equal(
    await second
      .getByRole('progressbar', { name: '다음 레벨 경험치' })
      .last()
      .getAttribute('value'),
    '50',
  );
  assert.equal(await second.locator('.achievement.unlocked').count(), 1);
  await second.reload();
  await second.getByRole('heading', { name: '노래 보내기' }).waitFor();
  await second.getByRole('navigation').getByRole('button', { name: '설정', exact: true }).click();
  assert.equal(
    await second
      .getByRole('button', { name: '프로필 활짝', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    await second
      .getByRole('button', { name: '프로필 색 로즈', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  await second.getByRole('button', { name: '이용 안내' }).click();
  await second.getByRole('button', { name: '다음', exact: true }).click();
  await second.getByRole('button', { name: '다음', exact: true }).click();
  await second.getByRole('button', { name: '시작하기' }).click();
  await second.screenshot({ path: '.artifacts/mobile-settings.png', fullPage: true });
  assert.equal(await second.getByLabel('나의 칭호').inputValue(), 'first');
  assert.equal(await second.locator('.genre-chart-row').count(), 1);
  await second.getByRole('navigation').getByRole('button', { name: '홈', exact: true }).click();
  await second.getByLabel('노래 링크').fill('https://youtu.be/5qap5aO4i9A');
  await second.getByText('자동 조회가 안 되어도 보낼 수 있어요.').waitFor();
  await second.getByLabel('곡 제목').fill('직접 입력한 곡');
  await second.getByLabel('아티스트 / 채널').fill('직접 입력한 아티스트');
  await second.getByRole('radio', { name: '보컬로이드', exact: true }).check();
  await second.getByRole('button', { name: '보틀 띄우기', exact: true }).click();
  await second.getByRole('heading', { name: /흘러가고/ }).waitFor();
  await second.getByRole('button', { name: '보틀 확인하기' }).click();
  await second.getByRole('button', { name: '보틀 회수하기' }).click();
  await second.getByRole('heading', { name: '노래 보내기' }).waitFor();
  for (const width of [320, 375, 768, 1024]) {
    await first.setViewportSize({ width, height: 900 });
    await first.getByRole('navigation').getByRole('button', { name: '홈', exact: true }).click();
    assert.ok(
      await first.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${width}px 가로 넘침 없음`,
    );
    for (const name of ['모두의 바다', '설정']) {
      await first.getByRole('navigation').getByRole('button', { name, exact: true }).click();
      assert.ok(
        await first.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${name} ${width}px 가로 넘침 없음`,
      );
    }
  }
  await first.getByRole('navigation').getByRole('button', { name: '홈', exact: true }).click();
  await first.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await first.locator('.page-intro').evaluate((node) => getComputedStyle(node).animationName),
    'none',
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: desktop/mobile, metadata auto-fill and manual fallback, mandatory genres, different-mood exchange, cover rendering, profile persistence, XP, achievements, history, favorites, report, responsive widths, reduced motion, no browser errors.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  store.db.close();
}
