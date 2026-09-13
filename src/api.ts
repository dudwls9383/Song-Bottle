import type { Snapshot } from './types';

const SESSION_KEY = 'song-bottle-session-v1';
let sessionPromise: Promise<string> | null = null;

// 익명 인증 토큰만 브라우저에 저장합니다. 곡과 교환 기록은 서버 DB에 저장됩니다.
async function session(): Promise<string> {
  const saved = localStorage.getItem(SESSION_KEY);
  if (saved) return saved;
  if (!sessionPromise)
    sessionPromise = fetch('/api/session', { method: 'POST' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '서버에 연결하지 못했어요.');
        localStorage.setItem(SESSION_KEY, data.token);
        return data.token as string;
      })
      .finally(() => {
        sessionPromise = null;
      });
  return sessionPromise;
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const token = await session();
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) localStorage.removeItem(SESSION_KEY);
    throw new Error(data.error || '요청을 완료하지 못했어요.');
  }
  return data;
}
export const getSnapshot = () => api<Snapshot>('/bottles');
