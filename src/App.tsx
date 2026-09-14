import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  Flag,
  Headphones,
  History as HistoryIcon,
  ListMusic,
  LoaderCircle,
  MessageSquareText,
  Music2,
  Radio,
  RefreshCw,
  Settings,
  Share2,
  Shield,
  Waves,
  X,
} from 'lucide-react';
import { api, getSnapshot } from './api';
import type { Bottle, Page, Snapshot } from './types';
import { Modal, SongItem, SongShowcase } from './components';
import Profile, { Avatar, LevelBar } from './pages/Profile';
import Home from './pages/Home';
import { Arrival, OceanFeed } from './voyage';
import { BottleStatusCard, History, Playlist, STATUS, date } from './pages/Library';
import Community from './pages/Community';

const NAV = [
  { id: 'home', name: '홈', icon: Waves },
  { id: 'ocean', name: '모두의 바다', icon: Radio },
  { id: 'history', name: '교환 기록', icon: HistoryIcon },
  { id: 'playlist', name: '플레이리스트', icon: ListMusic },
  { id: 'community', name: '커뮤니티', icon: MessageSquareText },
  { id: 'settings', name: '설정', icon: Settings },
] as const;
const empty: Snapshot = { bottles: [], stats: { waiting: 0, exchanges: 0 } };

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
  maxLines: number,
  weight: string,
) {
  const words = [...text];
  let line = '';
  let lineCount = 0;
  ctx.font = `${weight} 44px Pretendard, Segoe UI, sans-serif`;
  for (const word of words) {
    const test = line + word;
    if (ctx.measureText(test).width > width && line) {
      ctx.fillText(line, x, y + lineCount * lineHeight);
      line = word;
      lineCount++;
      if (lineCount >= maxLines) return;
    } else line = test;
  }
  if (line && lineCount < maxLines) ctx.fillText(line, x, y + lineCount * lineHeight);
}

export default function App() {
  const [page, setPage] = useState<Page>('home'),
    [data, setData] = useState<Snapshot>(empty),
    [ready, setReady] = useState(false),
    [connectionError, setConnectionError] = useState('');
  const [toast, setToast] = useState(''),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [dialog, setDialog] = useState<'about' | 'privacy' | 'help' | null>(null),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [report, setReport] = useState(false),
    [reason, setReason] = useState('부적절한 메시지');
  const seen = useRef<Set<string> | null>(null);
  const previousProgress = useRef<Snapshot['profile']>(undefined);
  const [milestone, setMilestone] = useState('');
  const inFlight = useRef<Promise<void> | null>(null);
  const refresh = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    inFlight.current = getSnapshot()
      .then((result) => {
        const before = previousProgress.current;
        if (before && result.profile) {
          const unlocked = result.profile.achievements.filter(
            (a) => a.unlocked && !before.achievements.some((b) => b.id === a.id && b.unlocked),
          );
          if (result.profile.level > before.level)
            setMilestone(`레벨 업! Lv. ${result.profile.level} ${result.profile.title}`);
          else if (unlocked.length)
            setMilestone(`도전 달성 · ${unlocked.map((a) => a.name).join(', ')}`);
        }
        previousProgress.current = result.profile;
        const arrived = result.bottles.find(
          (b) => b.status === 'matched' && seen.current && !seen.current.has(b.id),
        );
        if (arrived) {
          setToast('새로운 노래가 도착했어요! 교환 기록에서 확인해 보세요.');
          setSelectedId(arrived.id);
        }
        seen.current = new Set(
          result.bottles.filter((b) => b.status === 'matched').map((b) => b.id),
        );
        setData(result);
        setReady(true);
        setConnectionError('');
      })
      .catch((e) => {
        setConnectionError(e instanceof Error ? e.message : '서버에 연결하지 못했어요.');
        throw e;
      })
      .finally(() => {
        inFlight.current = null;
      });
    return inFlight.current;
  }, []);

  // 수정 지점: 폴링 주기. 데이터가 커지면 이 부분을 SSE 또는 WebSocket으로 바꿀 수 있습니다.
  useEffect(() => {
    const load = () => {
      void refresh().catch(() => {});
    };
    load();
    const timer = setInterval(load, 4000);
    window.addEventListener('focus', load);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!milestone) return;
    const timer = setTimeout(() => setMilestone(''), 7000);
    return () => clearTimeout(timer);
  }, [milestone]);
  const selected = data.bottles.find((b) => b.id === selectedId);
  function navigate(next: Page) {
    setPage(next);
    window.scrollTo({ top: 0 });
  }

  async function cancel() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await api(`/bottles/${selected.id}/cancel`, {});
      await refresh();
      setSelectedId(null);
      setToast('보틀을 회수했어요.');
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submitReport() {
    if (!selected?.received || busy) return;
    setBusy(true);
    try {
      await api('/reports', { bottleId: selected.received.id, reason });
      await refresh();
      setReport(false);
      setToast('신고가 접수되었고 해당 보틀을 숨겼어요.');
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function shareCard() {
    if (!selected?.received) return;
    const song = selected.received;
    const canvas = document.createElement('canvas');
    const scale = 2;
    canvas.width = 1080 * scale;
    canvas.height = 1350 * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.fillStyle = '#f6faf8';
    ctx.fillRect(0, 0, 1080, 1350);
    const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
    gradient.addColorStop(0, '#e5f5ee');
    gradient.addColorStop(0.48, '#ffffff');
    gradient.addColorStop(1, '#f1eef9');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1350);
    ctx.fillStyle = '#237d72';
    ctx.fillRect(0, 0, 1080, 12);
    ctx.fillStyle = '#252830';
    ctx.font = '700 48px Pretendard, Segoe UI, sans-serif';
    ctx.fillText('Song Bottle', 76, 130);
    ctx.fillStyle = '#777d87';
    ctx.font = '26px Pretendard, Segoe UI, sans-serif';
    ctx.fillText('낯선 리스너에게 도착한 오늘의 음악', 76, 178);
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 76, 255, 928, 660, 24);
    ctx.fill();
    ctx.strokeStyle = '#dde7e3';
    ctx.stroke();
    ctx.fillStyle = '#e8f4ef';
    roundRect(ctx, 136, 315, 220, 220, 18);
    ctx.fill();
    ctx.fillStyle = '#237d72';
    ctx.font = '700 88px Pretendard, Segoe UI, sans-serif';
    ctx.fillText('♪', 212, 455);
    ctx.fillStyle = '#90959e';
    ctx.font = '24px Pretendard, Segoe UI, sans-serif';
    ctx.fillText(song.platform, 136, 610);
    ctx.fillStyle = '#242832';
    drawWrapped(ctx, song.title || '도착한 노래', 136, 690, 790, 58, 3, '700');
    ctx.fillStyle = '#626976';
    ctx.font = '30px Pretendard, Segoe UI, sans-serif';
    ctx.fillText(song.artist || '익명의 음악', 136, 865);
    const tags = [song.genre, ...song.moods.map((m) => `#${m}`)].filter(Boolean);
    ctx.fillStyle = '#237d72';
    ctx.font = '24px Pretendard, Segoe UI, sans-serif';
    ctx.fillText(tags.join('   '), 136, 960);
    ctx.fillStyle = '#3c4450';
    ctx.font = '30px Pretendard, Segoe UI, sans-serif';
    drawWrapped(ctx, '한 곡을 보내고, 한 곡을 받았어요.', 76, 1080, 870, 44, 2, '500');
    ctx.fillStyle = '#8a909a';
    ctx.font = '24px Pretendard, Segoe UI, sans-serif';
    ctx.fillText('song bottle / music connects us', 76, 1235);
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'song-bottle-share-card.png';
    link.click();
    setToast('공유 카드를 만들었어요.');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate('home');
          }}
        >
          <div className="brand-mark">
            <Music2 size={23} />
          </div>
          <span>
            song<span className="brand-light">bottle</span>
            <small>MUSIC CONNECTS US</small>
          </span>
        </a>
        <div className="sidebar-label">YOUR SPACE</div>
        <nav aria-label="주 메뉴">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? 'nav-item active' : 'nav-item'}
              onClick={() => navigate(n.id)}
              aria-current={page === n.id ? 'page' : undefined}
            >
              <n.icon size={21} />
              <span>{n.name}</span>
              {n.id === 'history' && data.bottles.some((b) => b.status === 'waiting') && (
                <span className="nav-dot" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Headphones size={23} />
            <p>
              좋은 음악은
              <br />
              나눌수록 좋아지니까.
            </p>
            <span>A song for someone.</span>
          </div>
          <button
            className="help-button"
            onClick={() => {
              setStep(0);
              setDialog('help');
            }}
          >
            <CircleHelp size={17} />
            Song Bottle 알아보기
            <ArrowRight size={15} />
          </button>
          <button
            className="anonymous"
            onClick={() => navigate('settings')}
            aria-label="내 프로필 설정"
          >
            <Avatar avatar={data.profile?.avatar} color={data.profile?.color} />
            <div>
              익명의 리스너
              <small>
                Lv. {data.profile?.level || 1} · {data.profile?.title || '새싹 리스너'}
              </small>
            </div>
            <ChevronRight size={15} />
          </button>
          {data.profile && <LevelBar profile={data.profile} compact />}
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            나의 바다<span>/</span>
            <strong>{NAV.find((n) => n.id === page)?.name}</strong>
          </span>
          <div className="connection">
            <span className={`live-dot ${connectionError ? 'offline' : ''}`} />
            {connectionError ? '연결 재시도 중' : ready ? '음악으로 연결되는 중' : '바다에 연결 중'}
            <button
              className="icon-button"
              title="새로고침"
              aria-label="새로고침"
              onClick={() => {
                void refresh().catch(() => {});
              }}
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="topbar-profile"
              title="내 프로필"
              aria-label="내 프로필"
              onClick={() => navigate('settings')}
            >
              <Avatar avatar={data.profile?.avatar} color={data.profile?.color} />
              <span>Lv. {data.profile?.level || 1}</span>
            </button>
          </div>
        </header>
        <main>
          {connectionError && (
            <div className="connection-error" role="alert">
              {connectionError}
              <button
                onClick={() => {
                  void refresh().catch(() => {});
                }}
              >
                다시 연결
              </button>
            </div>
          )}
          {!ready ? (
            <div className="loading">
              <LoaderCircle className="spin" size={30} />
              <p>바다에 연결하고 있어요...</p>
            </div>
          ) : (
            <div className="page-enter" key={page}>
              {page === 'home' && (
                <Home
                  data={data}
                  refresh={refresh}
                  onSelect={(b) => {
                    setReport(false);
                    setSelectedId(b.id);
                  }}
                  notify={setToast}
                />
              )}
              {page === 'history' && (
                <History
                  bottles={data.bottles}
                  onSelect={(b) => {
                    setReport(false);
                    setSelectedId(b.id);
                  }}
                />
              )}
              {page === 'playlist' && <Playlist bottles={data.bottles} notify={setToast} />}
              {page === 'ocean' && (
                <OceanFeed activity={data.activity} onOpenHistory={() => navigate('history')} />
              )}
              {page === 'community' && <Community notify={setToast} />}
              {page === 'settings' && (
                <>
                  <div className="page-title">
                    <span className="eyebrow">MAKE YOURSELF AT HOME</span>
                    <h1>나의 리스너</h1>
                    <p>나의 작은 음악 공간.</p>
                  </div>
                  {data.profile && (
                    <Profile
                      bottles={data.bottles}
                      profile={data.profile}
                      refresh={refresh}
                      notify={setToast}
                    />
                  )}
                  <div className="settings-group">
                    <h3>나의 활동</h3>
                    <button onClick={() => navigate('history')}>
                      <HistoryIcon size={20} />
                      교환 기록
                      <ChevronRight size={18} />
                    </button>
                    <button onClick={() => navigate('playlist')}>
                      <ListMusic size={20} />내 플레이리스트
                      <ChevronRight size={18} />
                    </button>
                  </div>
                  <div className="settings-group">
                    <h3>Song Bottle</h3>
                    <button
                      onClick={() => {
                        setStep(0);
                        setDialog('help');
                      }}
                    >
                      <CircleHelp size={20} />
                      이용 안내
                      <ChevronRight size={18} />
                    </button>
                    <button onClick={() => setDialog('privacy')}>
                      <Shield size={20} />
                      데이터 보관 안내
                      <ChevronRight size={18} />
                    </button>
                    <button onClick={() => setDialog('about')}>
                      <Radio size={20} />
                      서비스 정보
                      <ChevronRight size={18} />
                    </button>
                  </div>
                  <p className="settings-footnote">Song Bottle · Version 1.1.0</p>
                </>
              )}
            </div>
          )}
        </main>
        <footer className="page-footer">
          <span>SONG BOTTLE</span>
          <span>한 곡에서 시작되는 작은 연결.</span>
          <span>EST. 2026</span>
        </footer>
      </div>
      {selected && (
        <Modal
          title={STATUS[selected.status]}
          onClose={() => {
            setSelectedId(null);
            setReport(false);
          }}
        >
          <div className={`result-symbol ${selected.status}`}>
            {selected.status === 'matched' ? (
              <CheckCheck size={30} />
            ) : selected.status === 'waiting' ? (
              <Waves size={30} />
            ) : (
              <Clock3 size={30} />
            )}
          </div>
          <div className="result-heading">
            <h3>
              {selected.status === 'matched'
                ? '당신에게 노래가 도착했어요.'
                : selected.status === 'waiting'
                  ? '보틀이 바다를 여행 중이에요.'
                  : '이 보틀의 여행이 끝났어요.'}
            </h3>
            <p>{date(selected.matchedAt || selected.createdAt)}</p>
          </div>
          <BottleStatusCard bottle={selected} />
          {selected.received && !selected.reported && (
            <Arrival key={selected.received.id} color={selected.received.bottleColor}>
              <SongShowcase key={selected.received.id} song={selected.received} />
              {milestone && (
                <div className="milestone" role="status">
                  <CheckCheck size={18} />
                  {milestone}
                </div>
              )}
              <SongItem song={selected.received} label="받은 노래" />
              <a
                className="primary listen-button"
                href={selected.received.url}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={18} />
                {selected.received.platform}에서 듣기
              </a>
              <button className="secondary full-width" onClick={shareCard}>
                <Share2 size={17} />
                공유 카드 만들기
              </button>
              {!report ? (
                <button className="report-button" onClick={() => setReport(true)}>
                  <Flag size={14} />
                  신고하기
                </button>
              ) : (
                <div className="report-form">
                  <label htmlFor="report-reason">신고 사유</label>
                  <select
                    id="report-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  >
                    {['부적절한 메시지', '음악이 아닌 링크', '기타'].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                  <button className="secondary" onClick={submitReport} disabled={busy}>
                    신고하고 숨기기
                  </button>
                </div>
              )}
            </Arrival>
          )}
          {selected.reported && <p className="muted">신고한 보틀은 숨겼어요.</p>}
          <div className="sent-result">
            <SongItem song={selected} label="보낸 노래" />
          </div>
          {selected.status === 'waiting' && (
            <>
              <p className="waiting-description">
                {selected.genre
                  ? `${selected.genre}${selected.current ? ` · 해류 ${selected.current}` : ''}에서 랜덤으로 만날 보틀을 기다리고 있어요. 최대 7일 후 만료됩니다.`
                  : '이전 버전에서 보낸 보틀이에요. 회수한 뒤 장르를 선택해서 다시 보내주세요.'}
              </p>
              <button className="secondary full-width" onClick={cancel} disabled={busy}>
                보틀 회수하기
              </button>
            </>
          )}
        </Modal>
      )}
      {dialog && (
        <Modal
          title={
            dialog === 'help'
              ? 'Song Bottle 알아보기'
              : dialog === 'privacy'
                ? '데이터 보관 안내'
                : '서비스 정보'
          }
          onClose={() => setDialog(null)}
        >
          {dialog === 'help' ? (
            <div className="onboarding">
              <img src="/assets/bottle.png" alt="음악 보틀" />
              <span className="eyebrow">0{step + 1} / 03</span>
              <h3>
                {
                  [
                    '당신의 한 곡, 누군가의 발견.',
                    '오늘의 무드를 담아주세요.',
                    '음악으로 서로를 만나세요.',
                  ][step]
                }
              </h3>
              <p>
                {
                  [
                    '좋아하는 곡의 공유 링크를 넣어주세요. YouTube, Spotify, Apple Music, SoundCloud를 지원해요.',
                    '음악 장르를 고르고 무드를 최대 3개 담아보세요. 해류 코드를 맞추면 같은 공간의 사람들과 교환할 수 있어요.',
                    '같은 장르 안에서 랜덤으로 만나요. 순수 랜덤은 이를 선택한 사람끼리 장르 제한 없이 교환해요. 상대가 없으면 최대 7일 동안 기다려요.',
                  ][step]
                }
              </p>
              <div className="onboarding-nav">
                <button
                  className="icon-button"
                  aria-label="이전 안내"
                  disabled={step === 0}
                  onClick={() => setStep(step - 1)}
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="step-dots">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className={i === step ? 'active' : ''} />
                  ))}
                </div>
                <button
                  className="primary"
                  onClick={() => (step < 2 ? setStep(step + 1) : setDialog(null))}
                >
                  {step < 2 ? '다음' : '시작하기'}
                  <ArrowRight size={17} />
                </button>
              </div>
            </div>
          ) : dialog === 'privacy' ? (
            <div className="prose">
              <p>
                가입 없이 음악을 교환하기 위해 브라우저에 익명 접속 키를 보관합니다. 즐겨찾기도 이
                브라우저에 저장됩니다.
              </p>
              <p>
                서버에는 곡 링크와 곡 정보, 장르, 무드, 메시지, 해류 코드, 교환 시각, 신고 내역과
                프로필 설정이 저장됩니다. 상대에게는 곡과 메시지, 프로필 아이콘과 레벨이 표시됩니다.
                공개 교환의 장르와 완료 시각은 모두의 바다에 표시됩니다. 개인 메시지와 해류 코드가
                있는 교환은 공개 소식에 포함하지 않습니다.
              </p>
              <p>
                이름, 연락처 등 개인 정보는 메시지에 적지 마세요. 브라우저 데이터를 지우면 기존
                기록에 다시 접근할 수 없습니다. 다른 기기와 기록은 동기화되지 않습니다.
              </p>
              <p>
                이 버전에는 계정 복구와 데이터 삭제 요청 화면이 아직 없습니다. 외부 음악 링크를 열면
                해당 서비스로 이동합니다.
              </p>
            </div>
          ) : (
            <div className="prose">
              <h3>Song Bottle</h3>
              <p>노래 하나를 보내고, 낯선 누군가의 취향을 만나는 익명 음악 교환 서비스입니다.</p>
              <p>
                선택한 장르와 해류 코드가 같은 사람 중 랜덤으로 교환합니다. 무드는 매칭 조건이
                아닙니다. 같은 곡끼리는 교환하지 않습니다.
              </p>
              <p>
                한 번에 하나의 보틀을 띄울 수 있고 같은 곡은 1시간 후 다시 보낼 수 있습니다. 신고된
                곡은 신고한 사람의 화면에서 숨겨집니다.
              </p>
              <p>
                교환 완료마다 25 XP가 쌓이고 100 XP마다 레벨이 올라갑니다. 도전과제를 달성하면 추가
                경험치를 받습니다.
              </p>
              <p>Version 1.1.0 · 2026</p>
            </div>
          )}
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button className="icon-button" aria-label="알림 닫기" onClick={() => setToast('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
