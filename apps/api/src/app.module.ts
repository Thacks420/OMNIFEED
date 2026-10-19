import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { RedditService } from './connectors/reddit/reddit.service';
import { YouTubeService } from './connectors/youtube/youtube.service';

@Module({
  controllers: [AppController],
  providers: [RedditService, YouTubeService],
})
export class AppModule {}
