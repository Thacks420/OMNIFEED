import { HttpException, Injectable } from '@nestjs/common';
import { RedditService } from '../connectors/reddit/reddit.service';
import { YouTubeService } from '../connectors/youtube/youtube.service';
import { FeedEngine, FeedError, type FeedOptions } from './feed-engine';
import { FileSessionStore } from './file-session-store';

@Injectable()
export class FeedService {
  private readonly engine: FeedEngine;
  constructor(reddit: RedditService, youtube: YouTubeService) {
    this.engine = new FeedEngine([
      { platform: 'reddit', fetch: o => reddit.getFeed({ cursor: o.cursor, limit: o.limit, subreddit: o.subreddit }) },
      { platform: 'youtube', fetch: o => youtube.getFeed({ cursor: o.cursor, limit: o.limit, query: o.query, regionCode: o.region, before: o.before }) },
    ], Date.now, 10 * 60_000, 100, new FileSessionStore(process.env.FEED_SESSION_DIR ?? '.data/feed-sessions'));
  }
  async getFeed(options: FeedOptions) {
    try { return await this.engine.getFeed(options); }
    catch (error) {
      if (error instanceof FeedError) throw new HttpException(error.message, error.status);
      throw error;
    }
  }
}
