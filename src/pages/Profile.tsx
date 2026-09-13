import { useState } from 'react';
import {
  Check,
  Compass,
  Disc3,
  Headphones,
  Heart,
  Laugh,
  Music2,
  Save,
  Smile,
  SmilePlus,
  Trophy,
  Waves,
} from 'lucide-react';
import type { Profile as ListenerProfile } from '../types';
import { AVATARS, AVATAR_COLORS } from '../../shared/rules';
import { api } from '../api';

const faces = {
  headphones: Headphones,
  smile: Smile,
  laugh: Laugh,
  wink: SmilePlus,
  music: Music2,
  disc: Disc3,
};
const names: Record<string, string> = {
  headphones: '헤드폰',
  smile: '미소',
  laugh: '활짝',
  wink: '설렘',
  music: '음표',
  disc: '레코드',
  mint: '민트',
  rose: '로즈',
  sky: '하늘',
  lemon: '레몬',
  lilac: '라일락',
  ink: '차콜',
};
const badges = { waves: Waves, disc: Disc3, compass: Compass, heart: Heart, trophy: Trophy };

export function Avatar({
  avatar = 'headphones',
  color = 'mint',
  large = false,
}: {
  avatar?: string;
  color?: string;
  large?: boolean;
}) {
  const Icon = faces[avatar as keyof typeof faces] || Headphones;
  return (
    <span className={`listener-avatar color-${color} ${large ? 'large' : ''}`}>
      <Icon size={large ? 38 : 20} strokeWidth={1.8} />
    </span>
  );
}

export function LevelBar({
  profile,
  compact = false,
}: {
  profile: ListenerProfile;
  compact?: boolean;
}) {
  return (
    <div className={`level-progress ${compact ? 'compact' : ''}`}>
      <div>
        <strong>
          Lv. {profile.level} <span>{profile.title}</span>
        </strong>
        <small>
          {profile.progress} / {profile.nextLevelXp} XP
        </small>
      </div>
      <progress aria-label="다음 레벨 경험치" max={profile.nextLevelXp} value={profile.progress} />
    </div>
  );
}

export default function Profile({
  profile,
  refresh,
  notify,
}: {
  profile: ListenerProfile;
  refresh: () => Promise<void>;
  notify: (text: string) => void;
}) {
  const [avatar, setAvatar] = useState(profile.avatar);
  const [color, setColor] = useState(profile.color);
  const [busy, setBusy] = useState(false);
  const changed = avatar !== profile.avatar || color !== profile.color;

  async function save() {
    setBusy(true);
    try {
      await api('/profile', { avatar, color });
      await refresh();
      notify('나만의 리스너가 준비됐어요.');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="listener-section">
        <div className="listener-heading">
          <Avatar avatar={avatar} color={color} large />
          <div>
            <span className="eyebrow">MY LITTLE IDENTITY</span>
            <h2>익명의 리스너</h2>
            <p>
              {profile.completed}번의 만남 · {profile.xp} XP
            </p>
          </div>
        </div>
        <LevelBar profile={profile} />
        <div className="avatar-editor">
          <fieldset>
            <legend>나의 표정</legend>
            <div className="avatar-options">
              {AVATARS.map((face) => (
                <button
                  key={face}
                  type="button"
                  title={names[face]}
                  aria-label={`프로필 ${names[face]}`}
                  aria-pressed={avatar === face}
                  onClick={() => setAvatar(face)}
                >
                  <Avatar avatar={face} color={avatar === face ? color : 'ink'} />
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>나의 색</legend>
            <div className="color-options">
              {AVATAR_COLORS.map((tone) => (
                <button
                  key={tone}
                  type="button"
                  title={names[tone]}
                  aria-label={`프로필 색 ${names[tone]}`}
                  aria-pressed={color === tone}
                  className={`color-swatch color-${tone}`}
                  onClick={() => setColor(tone)}
                >
                  {color === tone && <Check size={17} />}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
        <button className="primary" disabled={!changed || busy} onClick={save}>
          <Save size={17} />
          {busy ? '저장 중...' : '프로필 저장'}
        </button>
      </section>
      <section className="achievements-section">
        <div className="section-heading">
          <h2>
            <Trophy size={19} />
            작은 도전들
          </h2>
          <span>
            {profile.achievements.filter((a) => a.unlocked).length} / {profile.achievements.length}
          </span>
        </div>
        <div className="achievement-grid">
          {profile.achievements.map((a) => {
            const Icon = badges[a.icon as keyof typeof badges] || Trophy;
            return (
              <article key={a.id} className={`achievement ${a.unlocked ? 'unlocked' : ''}`}>
                <div className="achievement-icon">
                  <Icon size={23} />
                </div>
                <div className="achievement-copy">
                  <h3>
                    {a.name}
                    {a.unlocked && <Check size={15} />}
                  </h3>
                  <p>{a.description}</p>
                  <progress aria-label={a.name} max={a.target} value={a.value} />
                  <small>
                    {a.unlocked ? '달성 완료' : `${a.value} / ${a.target}`}
                    <span>+{a.bonus} XP</span>
                  </small>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
