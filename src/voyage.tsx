import { useState, type CSSProperties, type ReactNode } from 'react';
import { Check, Gift, Music2, Pause, Play, Waves } from 'lucide-react';
import { AVATAR_COLORS } from '../shared/rules';
import type { Bottle, Snapshot } from './types';

const colorNames: Record<string, string> = {
  mint: '민트',
  rose: '로즈',
  sky: '하늘',
  lemon: '레몬',
  lilac: '라일락',
  ink: '차콜',
};

export function BottleVisual({ color = 'mint' }: { color?: string }) {
  return (
    <div className={`voyage-bottle bottle-${color}`}>
      <img src="/assets/bottle.png" alt={`${colorNames[color] || '민트'} 음악 보틀`} />
    </div>
  );
}

export function BottleColors({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="bottle-palette">
      <legend>보틀의 색</legend>
      <div className="color-options">
        {AVATAR_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`color-swatch color-${color}`}
            title={`${colorNames[color]} 보틀`}
            aria-label={`${colorNames[color]} 보틀`}
            aria-pressed={value === color}
            onClick={() => onChange(color)}
          >
            {value === color && <Check size={17} />}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// 사용자가 열기 전까지 곡을 감춥니다. 재생을 자동으로 시작하지 않습니다.
export function Arrival({ color, children }: { color?: string; children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  return opened ? (
    <div className="letter-reveal">{children}</div>
  ) : (
    <div className="arrival-scene">
      <div className="arrival-tide" />
      <BottleVisual color={color} />
      <span className="arrival-stamp">
        <Gift size={16} /> A SONG FOR YOU
      </span>
      <p>누군가의 취향이 담겨 있어요.</p>
      <button className="primary" onClick={() => setOpened(true)}>
        <Gift size={18} />병 편지 열기
      </button>
    </div>
  );
}

export function OceanFeed({
  activity = [],
  onOpenHistory,
}: {
  activity: Snapshot['activity'];
  onOpenHistory: () => void;
}) {
  const [paused, setPaused] = useState(false);
  // 한 레인에 한 소식만 흘려 긴 문장도 서로 겹치지 않습니다. 최근 소식을 반복 재생합니다.
  const lanes = Array.from({ length: 5 }, (_, lane) =>
    activity.filter((_, index) => index % 5 === lane),
  );
  return (
    <section className="community-ocean">
      <div className="page-title">
        <span className="eyebrow">ACROSS THE OCEAN</span>
        <h1>모두의 바다</h1>
        <p>어딘가에서, 또 하나의 취향이 만났어요.</p>
      </div>
      <div className="section-heading">
        <h2>
          <Waves size={18} />
          최근 교환 소식
        </h2>
        <button
          className="icon-button"
          title={paused ? '소식 재생' : '소식 일시정지'}
          aria-label={paused ? '소식 재생' : '소식 일시정지'}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play size={18} /> : <Pause size={18} />}
        </button>
      </div>
      <div className={`danmaku-stage ${paused ? 'paused' : ''}`}>
        <div className="feed-backdrop">
          <BottleVisual color="sky" />
        </div>
        {activity.length ? (
          lanes.map((items, lane) => (
            <div className="danmaku-lane" key={lane}>
              {items.length > 0 && (
                <div
                  className="danmaku-track"
                  style={
                    {
                      '--duration': `${Math.max(24, items.length * 12)}s`,
                      '--delay': `${-8 - lane * 4}s`,
                    } as CSSProperties
                  }
                >
                  {items.map((item) => (
                    <button
                      className={`drifting-news color-${item.color}`}
                      key={item.id}
                      onClick={onOpenHistory}
                      title="내 교환 기록 보기"
                    >
                      <Music2 size={17} />
                      <strong>{item.genre || '음악'}</strong>두 리스너의 취향이 만났어요
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="ocean-silence">아직 조용한 바다예요. 첫 만남을 기다려요.</p>
        )}
        <div className="feed-water" />
      </div>
      <p className="feed-caption">
        최근 공개 교환 {activity.length}건 · 개인 메시지와 해류 코드 비공개
      </p>
      <details className="activity-list">
        <summary>소식 목록</summary>
        {activity.map((item) => (
          <button key={item.id} onClick={onOpenHistory}>
            <span>{item.genre || '음악'} · 교환 완료</span>
            <time>{new Date(item.at).toLocaleString('ko-KR')}</time>
          </button>
        ))}
      </details>
    </section>
  );
}

export function TasteGraphs({ bottles }: { bottles: Bottle[] }) {
  const matched = bottles.filter((b) => b.status === 'matched');
  const counts = new Map<string, number>();
  matched.forEach((b) =>
    counts.set(b.genre || '이전 기록', (counts.get(b.genre || '이전 기록') || 0) + 1),
  );
  const genres = [...counts].sort((a, b) => b[1] - a[1]);
  // 날짜 경계는 사용자의 현지 시간으로 계산합니다. 수신/발신을 중복 집계하지 않습니다.
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - 6 + index);
    const end = new Date(day);
    end.setDate(end.getDate() + 1);
    return {
      label: `${day.getMonth() + 1}/${day.getDate()}`,
      value: matched.filter((b) => b.matchedAt && b.matchedAt >= +day && b.matchedAt < +end).length,
    };
  });
  const peak = Math.max(1, ...days.map((day) => day.value));
  return (
    <section className="taste-section">
      <div className="section-heading">
        <h2>
          <Music2 size={18} />
          나의 음악 항해
        </h2>
        <span>{matched.length}번의 교환</span>
      </div>
      <div className="taste-grid">
        <div>
          <h3>교환한 장르</h3>
          {genres.length ? (
            <div className="genre-chart">
              {genres.map(([genre, count], index) => (
                <div className="genre-chart-row" key={genre}>
                  <div>
                    <span>{genre}</span>
                    <strong>{count}회</strong>
                  </div>
                  <div className="chart-track">
                    <span
                      style={
                        {
                          width: `${(count / matched.length) * 100}%`,
                          '--bar-color': ['#278978', '#df7694', '#529bd1', '#bfa236'][index % 4],
                        } as CSSProperties
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="chart-empty">첫 교환 후 취향이 그려져요.</p>
          )}
        </div>
        <div>
          <h3>최근 7일의 만남</h3>
          <div
            className="week-chart"
            role="img"
            aria-label={days.map((d) => `${d.label} ${d.value}회`).join(', ')}
          >
            {days.map((day) => (
              <div className="day-column" key={day.label}>
                <strong>{day.value}</strong>
                <div className="day-track">
                  <span style={{ height: `${(day.value / peak) * 100}%` }} />
                </div>
                <small>{day.label}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
