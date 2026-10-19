import { HttpException, Injectable } from '@nestjs/common';
import { RedditService } from '../connectors/reddit/reddit.service';
import { YouTubeService } from '../connectors/youtube/youtube.service';
import { FeedEngine, FeedError, type FeedOptions } from './feed-engine';

@Injectable()
export class FeedService {
  private readonly engine: FeedEngine;
  constructor(reddit: RedditService, youtube: YouTubeService) {
    this.engine = new FeedEngine([
      { platform: 'reddit', fetch: o => reddit.getFeed({ limit: o.limit, subreddit: o.subreddit }) },
      { platform: 'youtube', fetch: o => youtube.getFeed({ limit: o.limit, query: o.query, regionCode: o.region }) },
    ]);
  }
  async getFeed(options: FeedOptions) {
    try { return await this.engine.getFeed(options); }
    catch (error) {
      if (error instanceof FeedError) throw new HttpException(error.message, error.status);
      throw error;
    }
  }
}
