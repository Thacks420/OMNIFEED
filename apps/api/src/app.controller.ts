import { Controller, Get, Query } from '@nestjs/common';
import type { FeedResponse, Platform } from '@omnifeed/core';
import { RedditService } from './connectors/reddit/reddit.service';
import { YouTubeService } from './connectors/youtube/youtube.service';

@Controller()
export class AppController {
  constructor(
    private readonly redditService: RedditService,
    private readonly youtubeService: YouTubeService,
  ) {}

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
    @Query('query') query?: string,
    @Query('region') region?: string,
  ): Promise<FeedResponse> {
    const limit = limitRaw ? Number(limitRaw) : undefined;

    if (platform === 'reddit') {
      return this.redditService.getFeed({ cursor, limit, subreddit });
    }

    if (platform === 'youtube') {
      return this.youtubeService.getFeed({
        cursor,
        limit,
        query,
        regionCode: region,
      });
    }

    if (platform === 'x' || platform === 'instagram') {
      return { items: [], nextCursor: null };
    }

    const [redditResult, youtubeResult] = await Promise.allSettled([
      this.redditService.getFeed({ limit, subreddit }),
      this.youtubeService.getFeed({ limit, query, regionCode: region }),
    ]);

    const redditItems = redditResult.status === 'fulfilled' ? redditResult.value.items : [];
    const youtubeItems = youtubeResult.status === 'fulfilled' ? youtubeResult.value.items : [];

    const items = [...redditItems, ...youtubeItems].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    // Cross-platform cursor orchestration is intentionally deferred to issue #3.
    return { items, nextCursor: null };
  }
}
