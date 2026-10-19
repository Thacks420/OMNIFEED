import { Controller, Get, Query } from '@nestjs/common';
import type { FeedResponse, OmniPost, Platform } from '@omnifeed/core';
import { RedditService } from './connectors/reddit/reddit.service';

const mockYouTubePost: OmniPost = {
  id: 'youtube-ai-1',
  platform: 'youtube',
  author: { id: 'yt-channel-1', name: 'Tech Channel', handle: '@techchannel' },
  title: 'The Future of AI Hardware',
  text: 'A quick breakdown of where AI hardware is heading.',
  media: [
    {
      type: 'video',
      url: 'https://www.youtube.com/',
      thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    },
  ],
  stats: { likes: 125000, comments: 4100, views: 2100000 },
  originalUrl: 'https://www.youtube.com/',
  createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  topics: ['ai', 'technology'],
};

@Controller()
export class AppController {
  constructor(private readonly redditService: RedditService) {}

  @Get('health')
  health() {
    return { ok: true, service: 'omnifeed-api', version: '0.1.0' };
  }

  @Get('feed')
  async feed(
    @Query('platform') platform?: Platform,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
    @Query('subreddit') subreddit?: string,
  ): Promise<FeedResponse> {
    const limit = limitRaw ? Number(limitRaw) : undefined;

    if (platform === 'reddit') {
      return this.redditService.getFeed({ cursor, limit, subreddit });
    }

    if (platform === 'youtube') {
      return { items: [mockYouTubePost], nextCursor: null };
    }

    if (platform === 'x' || platform === 'instagram') {
      return { items: [], nextCursor: null };
    }

    const reddit = await this.redditService.getFeed({ cursor, limit, subreddit });
    const items = [...reddit.items, mockYouTubePost].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return { items, nextCursor: reddit.nextCursor };
  }
}
