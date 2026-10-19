import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { OmniPost } from '@omnifeed/core';

interface RedditTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

interface RedditListingResponse {
  data: {
    after: string | null;
    children: Array<{
      kind: string;
      data: RedditPostData;
    }>;
  };
}

interface RedditPostData {
  id: string;
  name: string;
  author: string;
  author_fullname?: string;
  title: string;
  selftext?: string;
  subreddit: string;
  subreddit_name_prefixed?: string;
  permalink: string;
  url?: string;
  created_utc: number;
  score?: number;
  ups?: number;
  num_comments?: number;
  post_hint?: string;
  is_video?: boolean;
  thumbnail?: string;
  preview?: {
    images?: Array<{
      source?: { url?: string };
    }>;
  };
}

export interface RedditFeedResult {
  items: OmniPost[];
  nextCursor: string | null;
}

@Injectable()
export class RedditService {
  private readonly clientId = process.env.REDDIT_CLIENT_ID;
  private readonly clientSecret = process.env.REDDIT_CLIENT_SECRET;
  private readonly userAgent =
    process.env.REDDIT_USER_AGENT ?? 'android:omnifeed:v0.1.0 (by /u/Thacks420)';
  private readonly defaultSubreddit = process.env.REDDIT_SUBREDDIT ?? 'popular';

  private cachedToken: { value: string; expiresAt: number } | null = null;

  async getFeed(options?: {
    cursor?: string;
    limit?: number;
    subreddit?: string;
  }): Promise<RedditFeedResult> {
    const accessToken = await this.getAccessToken();
    const limit = this.clampLimit(options?.limit ?? 25);
    const subreddit = this.cleanSubreddit(options?.subreddit ?? this.defaultSubreddit);

    const params = new URLSearchParams({
      limit: String(limit),
      raw_json: '1',
    });

    if (options?.cursor) {
      params.set('after', options.cursor);
    }

    const endpoint = `https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/hot?${params.toString()}`;

    const response = await this.fetchWithTimeout(endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': this.userAgent,
      },
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Reddit feed request failed with status ${response.status}`,
      );
    }

    const listing = (await response.json()) as RedditListingResponse;

    return {
      items: listing.data.children
        .filter((child) => child.kind === 't3')
        .map((child) => this.normalizePost(child.data)),
      nextCursor: listing.data.after,
    };
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 30_000) {
      return this.cachedToken.value;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new ServiceUnavailableException(
        'Reddit connector is not configured. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET.',
      );
    }

    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
      'utf8',
    ).toString('base64');

    const response = await this.fetchWithTimeout(
      'https://www.reddit.com/api/v1/access_token',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.userAgent,
        },
        body: new URLSearchParams({ grant_type: 'client_credentials' }),
      },
    );

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Reddit OAuth token request failed with status ${response.status}`,
      );
    }

    const token = (await response.json()) as RedditTokenResponse;
    if (!token.access_token || !token.expires_in) {
      throw new ServiceUnavailableException('Reddit OAuth returned an invalid token response');
    }

    this.cachedToken = {
      value: token.access_token,
      expiresAt: now + token.expires_in * 1000,
    };

    return token.access_token;
  }

  private normalizePost(post: RedditPostData): OmniPost {
    const previewUrl = this.decodeHtml(post.preview?.images?.[0]?.source?.url);
    const media = this.extractMedia(post, previewUrl);

    return {
      id: `reddit-${post.id}`,
      platform: 'reddit',
      author: {
        id: post.author_fullname ?? `reddit-user-${post.author}`,
        name: post.author,
        handle: `u/${post.author}`,
      },
      title: post.title,
      text: post.selftext?.trim() || post.title,
      ...(media.length ? { media } : {}),
      stats: {
        likes: post.score ?? post.ups ?? 0,
        comments: post.num_comments ?? 0,
      },
      originalUrl: `https://www.reddit.com${post.permalink}`,
      createdAt: new Date(post.created_utc * 1000).toISOString(),
      topics: [post.subreddit.toLowerCase()],
    };
  }

  private extractMedia(
    post: RedditPostData,
    previewUrl?: string,
  ): NonNullable<OmniPost['media']> {
    if (post.is_video) {
      return [
        {
          type: 'video',
          url: `https://www.reddit.com${post.permalink}`,
          ...(previewUrl ? { thumbnailUrl: previewUrl } : {}),
        },
      ];
    }

    if (post.post_hint === 'image' && (post.url || previewUrl)) {
      const imageUrl = this.decodeHtml(post.url) ?? previewUrl;
      return imageUrl ? [{ type: 'image', url: imageUrl }] : [];
    }

    if (previewUrl) {
      return [{ type: 'image', url: previewUrl }];
    }

    return [];
  }

  private cleanSubreddit(value: string): string {
    const cleaned = value.replace(/^r\//i, '').trim();
    if (!cleaned || !/^[A-Za-z0-9_+]+$/.test(cleaned)) {
      return 'popular';
    }
    return cleaned;
  }

  private clampLimit(value: number): number {
    if (!Number.isFinite(value)) return 25;
    return Math.min(100, Math.max(1, Math.trunc(value)));
  }

  private decodeHtml(value?: string): string | undefined {
    if (!value) return undefined;
    return value.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
  }

  private async fetchWithTimeout(
    input: string,
    init: RequestInit,
    timeoutMs = 8_000,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown network error';
      throw new ServiceUnavailableException(`Reddit request failed: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}
