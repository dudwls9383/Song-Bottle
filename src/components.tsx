import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowUpRight, Music2, X } from 'lucide-react';
import type { Song } from './types';

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
      <div className={`song-art art-${song.platform.toLowerCase().split(' ')[0]}`}>
        <Music2 size={24} />
      </div>
      <div className="song-info">
        {label && <small>{label}</small>}
        <a href={song.url} target="_blank" rel="noreferrer">
          {song.title}
          <ArrowUpRight size={15} />
        </a>
        <div className="song-meta">
          <Platform name={song.platform} />
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
