import { Controller, Get, Query } from '@nestjs/common';
import type { FeedResponse, Platform } from '@omnifeed/core';
import { FeedService } from './feed/feed.service';

@Controller()
export class AppController {
  constructor(private readonly feedService: FeedService) {}
  @Get('health')
  health() { return { ok: true, service: 'omnifeed-api', version: '0.1.0' }; }
  @Get('feed')
  feed(
    @Query('platform') platform?: Platform,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
    @Query('subreddit') subreddit?: string,
    @Query('query') query?: string,
    @Query('region') region?: string,
  ): Promise<FeedResponse> {
    return this.feedService.getFeed({ platform, cursor,
      limit: limitRaw === undefined ? undefined : Number(limitRaw), subreddit, query, region });
  }
}
