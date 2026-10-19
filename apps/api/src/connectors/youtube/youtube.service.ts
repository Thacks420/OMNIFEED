import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { OmniPost } from '@omnifeed/core';

interface YouTubeThumbnail {
  url: string;
  width?: number;
  height?: number;
}

interface YouTubeVideoItem {
  id: string;
  snippet?: {
    publishedAt?: string;
    channelId?: string;
    title?: string;
    description?: string;
    channelTitle?: string;
    tags?: string[];
    thumbnails?: Record<string, YouTubeThumbnail>;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
}

interface YouTubeVideoListResponse {
  nextPageToken?: string;
  prevPageToken?: string;
  items?: YouTubeVideoItem[];
}

interface YouTubeSearchItem {
  id?: {
    videoId?: string;
  };
}

interface YouTubeSearchResponse {
  nextPageToken?: string;
  items?: YouTubeSearchItem[];
}

export interface YouTubeFeedResult {
  items: OmniPost[];
  nextCursor: string | null;
}

@Injectable()
export class YouTubeService {
  private readonly apiKey = process.env.YOUTUBE_API_KEY;
  private readonly defaultRegion = this.cleanRegion(process.env.YOUTUBE_REGION ?? 'US');

  async getFeed(options?: {
    cursor?: string;
    limit?: number;
    query?: string;
    regionCode?: string;
    before?: string;
  }): Promise<YouTubeFeedResult> {
    this.ensureConfigured();

    const limit = this.clampLimit(options?.limit ?? 25);
    const regionCode = this.cleanRegion(options?.regionCode ?? this.defaultRegion);
    const query = options?.query?.trim();

    return this.searchFeed({ query: query ?? '', cursor: options?.cursor,
      limit, regionCode, before: options?.before });
  }

  private async searchFeed(options: {
    query: string;
    before?: string;
    cursor?: string;
    limit: number;
    regionCode: string;
  }): Promise<YouTubeFeedResult> {
    const searchParams = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      maxResults: String(options.limit),
      order: 'date',
      regionCode: options.regionCode,
      key: this.apiKey!,
    });

    if (options.query) searchParams.set('q', options.query);
    if (options.before) searchParams.set('publishedBefore', options.before);

    if (options.cursor) {
      searchParams.set('pageToken', options.cursor);
    }

    const search = await this.fetchJson<YouTubeSearchResponse>(
      `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`,
    );

    const videoIds = (search.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => Boolean(id));

    if (!videoIds.length) {
      return { items: [], nextCursor: search.nextPageToken ?? null };
    }

    const videosParams = new URLSearchParams({
      part: 'snippet,statistics',
      id: videoIds.join(','),
      key: this.apiKey!,
    });

    const videos = await this.fetchJson<YouTubeVideoListResponse>(
      `https://www.googleapis.com/youtube/v3/videos?${videosParams.toString()}`,
    );

    const byId = new Map((videos.items ?? []).map((item) => [item.id, item]));
    const orderedItems = videoIds
      .map((id) => byId.get(id))
      .filter((item): item is YouTubeVideoItem => Boolean(item))
      .map((item) => this.normalizeVideo(item));

    return {
      items: orderedItems,
      nextCursor: search.nextPageToken ?? null,
    };
  }

  private normalizeVideo(video: YouTubeVideoItem): OmniPost {
    const snippet = video.snippet ?? {};
    const thumbnail = this.bestThumbnail(snippet.thumbnails);
    const videoUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}`;

    return {
      id: `youtube-${video.id}`,
      platform: 'youtube',
      author: {
        id: snippet.channelId ?? `youtube-channel-${video.id}`,
        name: snippet.channelTitle ?? 'Unknown channel',
      },
      title: snippet.title ?? 'Untitled video',
      text: snippet.description?.trim() || snippet.title || 'YouTube video',
      media: [
        {
          type: 'video',
          url: videoUrl,
          ...(thumbnail ? { thumbnailUrl: thumbnail } : {}),
        },
      ],
      stats: {
        views: this.parseCount(video.statistics?.viewCount),
        likes: this.parseCount(video.statistics?.likeCount),
        comments: this.parseCount(video.statistics?.commentCount),
      },
      originalUrl: videoUrl,
      createdAt: this.safeDate(snippet.publishedAt),
      topics: this.normalizeTopics(snippet.tags),
    };
  }

  private bestThumbnail(thumbnails?: Record<string, YouTubeThumbnail>): string | undefined {
    if (!thumbnails) return undefined;

    return (
      thumbnails.maxres?.url ??
      thumbnails.standard?.url ??
      thumbnails.high?.url ??
      thumbnails.medium?.url ??
      thumbnails.default?.url
    );
  }

  private normalizeTopics(tags?: string[]): string[] | undefined {
    if (!tags?.length) return undefined;

    const topics = Array.from(
      new Set(
        tags
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean),
      ),
    ).slice(0, 8);

    return topics.length ? topics : undefined;
  }

  private parseCount(value?: string): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private safeDate(value?: string): string {
    const date = value ? new Date(value) : new Date(NaN);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }

  private clampLimit(value: number): number {
    if (!Number.isFinite(value)) return 25;
    return Math.min(50, Math.max(1, Math.trunc(value)));
  }

  private cleanRegion(value: string): string {
    const normalized = value.trim().toUpperCase();
    return /^[A-Z]{2}$/.test(normalized) ? normalized : 'US';
  }

  private ensureConfigured(): void {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'YouTube connector is not configured. Set YOUTUBE_API_KEY.',
      );
    }
  }

  private async fetchJson<T>(url: string, timeoutMs = 8_000): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        let detail = '';
        try {
          const body = (await response.json()) as {
            error?: { message?: string };
          };
          detail = body.error?.message ? `: ${body.error.message}` : '';
        } catch {
          // Ignore malformed error bodies.
        }

        throw new ServiceUnavailableException(
          `YouTube API request failed with status ${response.status}${detail}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown network error';
      throw new ServiceUnavailableException(`YouTube request failed: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}
