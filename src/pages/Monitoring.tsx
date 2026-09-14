import { BarChart3, CircleDot, Gauge, Hash, Music2, Radio, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Snapshot } from '../types';
import { STATUS } from './Library';

type Count = { name: string; count: number };

const colors = ['#237d72', '#b8738f', '#5d8fc1', '#b99543', '#7f72c8', '#64707d'];

function number(value = 0) {
  return value.toLocaleString('ko-KR');
}

function percent(value: number, total: number) {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

function Ranking({
  title,
  icon,
  items = [],
  empty,
}: {
  title: string;
  icon: ReactNode;
  items?: Count[];
  empty: string;
}) {
  const peak = Math.max(1, ...items.map((item) => item.count));
  return (
    <section className="monitor-panel">
      <div className="section-heading">
        <h2>
          {icon}
          {title}
        </h2>
        <span>TOP {items.length || 0}</span>
      </div>
      {items.length ? (
        <div className="monitor-bars">
          {items.map((item, index) => (
            <div className="monitor-bar-row" key={item.name}>
              <div>
                <strong>{item.name}</strong>
                <span>{number(item.count)}</span>
              </div>
              <div className="monitor-track">
                <span
                  style={{
                    width: `${(item.count / peak) * 100}%`,
                    background: colors[index % colors.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="monitor-empty">{empty}</p>
      )}
    </section>
  );
}

export default function Monitoring({ stats }: { stats: Snapshot['stats'] }) {
  const total = stats.totalBottles || 0;
  const exchanges = stats.exchanges || 0;
  const statusItems = stats.statuses || [];
  const daily = stats.dailyExchanges || [];
  const dailyPeak = Math.max(1, ...daily.map((item) => item.count));
  const matched = statusItems.find((item) => item.name === 'matched')?.count || 0;
  const waiting = statusItems.find((item) => item.name === 'waiting')?.count || 0;
  const cancelled = statusItems.find((item) => item.name === 'cancelled')?.count || 0;
  const expired = statusItems.find((item) => item.name === 'expired')?.count || 0;

  return (
    <>
      <div className="page-title">
        <span className="eyebrow">SERVICE MONITORING</span>
        <h1>모니터링</h1>
        <p>지금 바다에서 어떤 음악과 태그가 많이 흐르는지 한눈에 봐요.</p>
      </div>
      <section className="monitor-summary" aria-label="서비스 요약">
        <div>
          <Music2 size={20} />
          <span>전체 보틀</span>
          <strong>{number(total)}</strong>
        </div>
        <div>
          <Radio size={20} />
          <span>완료 교환</span>
          <strong>{number(exchanges)}</strong>
        </div>
        <div>
          <Gauge size={20} />
          <span>매칭률</span>
          <strong>{percent(matched, total)}</strong>
        </div>
        <div>
          <UsersRound size={20} />
          <span>참여 리스너</span>
          <strong>{number(stats.activeUsers)}</strong>
        </div>
      </section>
      <section className="monitor-panel">
        <div className="section-heading">
          <h2>
            <BarChart3 size={18} />
            최근 7일 교환량
          </h2>
          <span>{number(daily.reduce((sum, item) => sum + item.count, 0))}회</span>
        </div>
        <div className="monitor-week" role="img" aria-label="최근 7일 교환량">
          {daily.map((item) => (
            <div className="monitor-day" key={item.label}>
              <strong>{number(item.count)}</strong>
              <div>
                <span style={{ height: `${(item.count / dailyPeak) * 100}%` }} />
              </div>
              <small>{item.label}</small>
            </div>
          ))}
        </div>
      </section>
      <div className="monitor-grid">
        <Ranking
          title="장르 사용량"
          icon={<Music2 size={18} />}
          items={stats.genres}
          empty="아직 장르 데이터가 없어요."
        />
        <Ranking
          title="태그 사용량"
          icon={<Hash size={18} />}
          items={stats.moods}
          empty="아직 무드 태그가 없어요."
        />
        <Ranking
          title="플랫폼 분포"
          icon={<CircleDot size={18} />}
          items={stats.platforms}
          empty="아직 플랫폼 데이터가 없어요."
        />
        <section className="monitor-panel">
          <div className="section-heading">
            <h2>
              <Gauge size={18} />
              보틀 상태
            </h2>
            <span>{number(total)}개</span>
          </div>
          <div className="status-metrics">
            {[
              ['matched', matched],
              ['waiting', waiting],
              ['cancelled', cancelled],
              ['expired', expired],
            ].map(([name, count]) => (
              <div key={name}>
                <span className={`status ${name}`}>{STATUS[name as keyof typeof STATUS]}</span>
                <strong>{number(count as number)}</strong>
                <small>{percent(count as number, total)}</small>
              </div>
            ))}
          </div>
          <div className="community-metrics">
            <div>
              <span>게시글</span>
              <strong>{number(stats.communityPosts)}</strong>
            </div>
            <div>
              <span>좋아요</span>
              <strong>{number(stats.communityLikes)}</strong>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
