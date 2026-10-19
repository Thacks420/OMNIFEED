import { Module } from '@nestjs/common';
import { FeedService } from './feed/feed.service';
import { AppController } from './app.controller';
import { RedditService } from './connectors/reddit/reddit.service';
import { YouTubeService } from './connectors/youtube/youtube.service';

@Module({
  controllers: [AppController],
  providers: [RedditService, YouTubeService, FeedService],
})
export class AppModule {}
