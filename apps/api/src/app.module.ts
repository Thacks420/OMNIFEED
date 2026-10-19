import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { RedditService } from './connectors/reddit/reddit.service';

@Module({
  controllers: [AppController],
  providers: [RedditService],
})
export class AppModule {}
