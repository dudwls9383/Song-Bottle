export type Page = 'home' | 'history' | 'playlist' | 'community' | 'settings' | 'ocean';
export type Song = {
  id: string;
  url: string;
  title: string;
  artist: string;
  artwork: string;
  artistKind: string;
  genre: string;
  bottleColor?: string;
  listener?: { avatar: string; color: string; level: number; title: string };
  platform: string;
  moods: string[];
  message: string;
  createdAt: number;
};
export type Bottle = Song & {
  current: string;
  status: 'waiting' | 'matched' | 'cancelled' | 'expired';
  matchedAt: number | null;
  received: Song | null;
  reported: boolean;
};
export type Metadata = {
  url: string;
  platform: string;
  title: string;
  artist: string;
  artwork: string;
  artistKind: string;
};
export type Profile = {
  titleId: string;
  titles: { id: string; name: string; unlocked: boolean }[];
  avatar: string;
  color: string;
  xp: number;
  level: number;
  progress: number;
  nextLevelXp: number;
  title: string;
  completed: number;
  achievements: {
    id: string;
    name: string;
    description: string;
    value: number;
    target: number;
    bonus: number;
    icon: string;
    unlocked: boolean;
  }[];
};
export type Snapshot = {
  activity?: { id: string; genre: string; color: string; at: number }[];
  bottles: Bottle[];
  stats: { waiting: number; exchanges: number };
  profile?: Profile;
};
export type CommunityPost = {
  id: string;
  body: string;
  mood: string;
  createdAt: number;
  likes: number;
  liked: boolean;
  mine: boolean;
  listener: { avatar: string; color: string; level: number; title: string };
};
