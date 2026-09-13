import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, Music2, X } from 'lucide-react';
import type { Metadata, Song } from './types';
import { api } from './api';
import { Avatar } from './pages/Profile';

export function SongArt({
  artwork,
  platform,
  large = false,
}: {
  artwork?: string;
  platform: string;
  large?: boolean;
}) {
  const [failed, setFailed] = useState('');
  return (
    <div
      className={`song-art art-${platform.toLowerCase().split(' ')[0]} ${large ? 'cover-large' : ''}`}
    >
      {artwork && failed !== artwork ? (
        <img
          src={artwork}
          alt="곡 커버"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(artwork)}
        />
      ) : (
        <Music2 size={large ? 48 : 24} />
      )}
    </div>
  );
}

// 예전 기록에 커버가 없어도 상세 화면에서 조회합니다. 응답의 HTML은 렌더링하지 않습니다.
export function SongShowcase({ song }: { song: Song }) {
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  useEffect(() => {
    let active = true;
    setMetadata(null);
    if (!song.artwork)
      void api<Metadata>(`/metadata?url=${encodeURIComponent(song.url)}`)
        .then((info) => {
          if (active) setMetadata(info);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [song.url, song.artwork]);
  return (
    <div className="song-showcase">
      <a
        href={song.url}
        target="_blank"
        rel="noreferrer"
        aria-label={`${song.title} 음악 서비스에서 열기`}
      >
        <SongArt platform={song.platform} artwork={song.artwork || metadata?.artwork} large />
      </a>
      {song.listener && (
        <div className="sender-identity">
          <Avatar avatar={song.listener.avatar} color={song.listener.color} />
          <span>
            익명의 리스너
            <small>
              Lv. {song.listener.level} · {song.listener.title}
            </small>
          </span>
        </div>
      )}
    </div>
  );
}

export function Platform({ name }: { name: string }) {
  return (
    <span className={`platform platform-${name.toLowerCase().split(' ')[0]}`}>
      <Music2 size={13} />
      {name}
    </span>
  );
}

export function SongItem({
  song,
  label,
  action,
}: {
  song: Song;
  label?: string;
  action?: ReactNode;
}) {
  return (
    <article className="song-item">
      <SongArt artwork={song.artwork} platform={song.platform} />
      <div className="song-info">
        {label && <small>{label}</small>}
        <a href={song.url} target="_blank" rel="noreferrer">
          {song.title}
          <ArrowUpRight size={15} />
        </a>
        {song.artist && (
          <p className="song-artist">
            {song.artistKind === 'channel' ? '채널 · ' : ''}
            {song.artist}
          </p>
        )}
        <div className="song-meta">
          <Platform name={song.platform} />
          {song.genre && <span className="genre-label">{song.genre}</span>}
          {song.moods.map((m) => (
            <span key={m}>#{m}</span>
          ))}
        </div>
        {song.message && <p className="song-message">“{song.message}”</p>}
      </div>
      {action}
    </article>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button className="icon-button" aria-label="닫기" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <Music2 size={34} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
