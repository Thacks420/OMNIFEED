import { Controller, Get, Query } from '@nestjs/common';
import type { FeedResponse, OmniPost, Platform } from '@omnifeed/core';

const mockPosts: OmniPost[] = [
  {
    id: 'reddit-python-1',
    platform: 'reddit',
    author: { id: 'r-user-1', name: 'code_newbie', handle: 'u/code_newbie' },
    title: 'What are the best Python projects for beginners?',
    text: 'Looking for project ideas to improve my skills. Any suggestions?',
    stats: { likes: 2300, comments: 420 },
    originalUrl: 'https://www.reddit.com/r/Python/',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    topics: ['programming', 'python'],
  },
  {
    id: 'youtube-ai-1',
    platform: 'youtube',
    author: { id: 'yt-channel-1', name: 'Tech Channel', handle: '@techchannel' },
    title: 'The Future of AI Hardware',
    text: 'A quick breakdown of where AI hardware is heading.',
    media: [
      {
        type: 'video',
        url: 'https://www.youtube.com/',
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
      }
    ],
    stats: { likes: 125000, comments: 4100, views: 2100000 },
    originalUrl: 'https://www.youtube.com/',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    topics: ['ai', 'technology'],
  },
];

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { ok: true, service: 'omnifeed-api', version: '0.1.0' };
  }

  @Get('feed')
  feed(@Query('platform') platform?: Platform): FeedResponse {
    const items = platform
      ? mockPosts.filter((post) => post.platform === platform)
      : [...mockPosts].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );

    return { items, nextCursor: null };
  }
}
