export type Page = 'home' | 'history' | 'playlist' | 'settings';
export type Song = {
  id: string;
  url: string;
  title: string;
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
export type Snapshot = { bottles: Bottle[]; stats: { waiting: number; exchanges: number } };
