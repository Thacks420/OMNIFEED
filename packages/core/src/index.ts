export type Platform = 'reddit' | 'youtube' | 'x' | 'instagram';

export interface OmniPost {
  id: string;
  platform: Platform;
  author: {
    id: string;
    name: string;
    handle?: string;
    avatarUrl?: string;
  };
  text: string;
  title?: string;
  media?: {
    type: 'image' | 'video';
    url: string;
    thumbnailUrl?: string;
  }[];
  stats: {
    likes?: number;
    comments?: number;
    views?: number;
  };
  originalUrl: string;
  createdAt: string;
  topics?: string[];
}

export interface FeedResponse {
  items: OmniPost[];
  nextCursor: string | null;
  warnings?: { platform: Platform; message: string }[];
}
