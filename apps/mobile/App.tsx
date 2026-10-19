import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { OmniPost, Platform } from '@omnifeed/core';
import { FeedClientError, requestFeed } from './feed-client';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000';
const tabs: Array<{ label: string; value?: Platform }> = [
  { label: 'All' },
  { label: 'Reddit', value: 'reddit' },
  { label: 'YouTube', value: 'youtube' },
];

const fallbackPosts: OmniPost[] = [
  {
    id: 'fallback-reddit',
    platform: 'reddit',
    author: { id: 'r1', name: 'code_newbie', handle: 'u/code_newbie' },
    title: 'What are the best Python projects for beginners?',
    text: 'Looking for project ideas to improve my skills.',
    stats: { likes: 2300, comments: 420 },
    originalUrl: 'https://reddit.com',
    createdAt: new Date().toISOString(),
    topics: ['python', 'programming'],
  },
  {
    id: 'fallback-youtube',
    platform: 'youtube',
    author: { id: 'y1', name: 'Tech Channel', handle: '@techchannel' },
    title: 'The Future of AI Hardware',
    text: 'A quick breakdown of where AI hardware is heading.',
    stats: { likes: 125000, comments: 4100, views: 2100000 },
    originalUrl: 'https://youtube.com',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    topics: ['ai', 'technology'],
  },
];

function compact(value?: number) {
  if (!value) return '0';
  return new Intl.NumberFormat('en', { notation: 'compact' }).format(value);
}

function PostCard({ post }: { post: OmniPost }) {
  const badge = post.platform === 'reddit' ? '● Reddit' : '▶ YouTube';
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.platform}>{badge}</Text>
        <Text style={styles.time}>
          {new Date(post.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
      <Text style={styles.author}>{post.author.handle ?? post.author.name}</Text>
      {!!post.title && <Text style={styles.title}>{post.title}</Text>}
      <Text style={styles.body}>{post.text}</Text>
      <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(post.originalUrl).catch(() => {}); }}>
        <Text style={styles.platform}>Open original ↗</Text>
      </Pressable>
      <View style={styles.stats}>
        <Text style={styles.stat}>♥ {compact(post.stats.likes)}</Text>
        <Text style={styles.stat}>💬 {compact(post.stats.comments)}</Text>
        {!!post.stats.views && <Text style={styles.stat}>◉ {compact(post.stats.views)}</Text>}
      </View>
    </View>
  );
}

export default function App() {
  const [platform, setPlatform] = useState<Platform | undefined>();
  const [posts, setPosts] = useState<OmniPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [offlineDemo, setOfflineDemo] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const request = useRef<AbortController | null>(null);

  async function loadPage(cursor?: string) {
    if (cursor && busy.current) return;
    if (!cursor) request.current?.abort();
    const current = cursor ? generation.current : ++generation.current;
    const controller = new AbortController();
    request.current = controller;
    busy.current = true;
    setLoading(true);
    setError(null);
    setWarnings([]);
    if (!cursor) { setPosts([]); setNextCursor(null); setOfflineDemo(false); }
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const data = await requestFeed(API_URL, { platform, cursor, signal: controller.signal });
      if (generation.current !== current) return;
      setPosts(previous => cursor
        ? [...new Map([...previous, ...data.items].map(p => [p.id, p])).values()]
        : data.items);
      setNextCursor(data.nextCursor);
      setWarnings((data.warnings ?? []).map(w => `${w.platform}: ${w.message}`));
      setOfflineDemo(false);
    } catch (error) {
      if (generation.current !== current) return;
      setError(error instanceof Error ? error.message : 'Unable to connect to API');
      if (error instanceof FeedClientError && error.status === 410) setNextCursor(null);
      if (!cursor) {
        setPosts(platform ? fallbackPosts.filter(p => p.platform === platform) : fallbackPosts);
        setOfflineDemo(true);
      }
    } finally {
      clearTimeout(timeout);
      if (generation.current === current) { busy.current = false; setLoading(false); }
    }
  }

  useEffect(() => {
    void loadPage();
    return () => { ++generation.current; request.current?.abort(); busy.current = false; };
  }, [platform]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>OmniFeed</Text>
          <Text style={styles.subtitle}>One feed. Your algorithm.</Text>
        </View>
        <Text style={styles.stat}>{loading ? 'Connecting…' : offlineDemo ? 'Demo' : warnings.length ? 'Partial feed' : 'Connected'}</Text>
      </View>

      <View style={styles.tabs}>
        {tabs.map((tab) => {
          const active = tab.value === platform;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={tab.label}
              onPress={() => setPlatform(tab.value)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {offlineDemo && (
        <Text style={styles.demoBanner}>Offline demo • API connection unavailable</Text>
      )}

      {error && <Text style={styles.demoBanner}>{error}</Text>}
      {warnings.map(w => <Text key={w} style={styles.demoBanner}>{w}</Text>)}
      {error && !loading && !nextCursor && (
        <Pressable style={styles.tab} accessibilityRole="button" onPress={() => void loadPage()}>
          <Text style={styles.tabText}>Refresh feed</Text>
        </Pressable>
      )}

      <FlatList
        data={posts}
        refreshing={loading && !nextCursor}
        onRefresh={() => void loadPage()}
        ListEmptyComponent={!loading ? <Text style={styles.stat}>No posts available.</Text> : null}
        ListFooterComponent={loading ? <ActivityIndicator style={styles.loader} /> : nextCursor ? (
          <Pressable style={styles.tab} onPress={() => void loadPage(nextCursor)}>
            <Text style={styles.tabText}>{error ? 'Retry loading more' : 'Load more'}</Text>
          </Pressable>
        ) : null}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PostCard post={item} />}
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#090b10' },
  header: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: { color: '#f6f7fb', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#8f98aa', marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusDemo: { backgroundColor: '#f4b942' },
  statusLive: { backgroundColor: '#49d17d' },
  tabs: { flexDirection: 'row', paddingHorizontal: 14, gap: 8, marginBottom: 8 },
  tab: { paddingVertical: 9, paddingHorizontal: 15, backgroundColor: '#141821', borderRadius: 999 },
  tabActive: { backgroundColor: '#e9edff' },
  tabText: { color: '#aeb6c5', fontWeight: '700' },
  tabTextActive: { color: '#0b0d12' },
  demoBanner: {
    color: '#d8b15d',
    backgroundColor: '#1a1710',
    paddingVertical: 8,
    paddingHorizontal: 18,
    fontSize: 12,
  },
  loader: { marginTop: 12 },
  list: { padding: 14, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: '#11151d',
    borderColor: '#242b38',
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  platform: { color: '#d7def0', fontSize: 13, fontWeight: '800' },
  time: { color: '#697386', fontSize: 12 },
  author: { color: '#838da0', fontSize: 13, marginTop: 12 },
  title: { color: '#f5f7fb', fontSize: 18, fontWeight: '800', lineHeight: 24, marginTop: 8 },
  body: { color: '#c3cad7', fontSize: 15, lineHeight: 21, marginTop: 7 },
  stats: { flexDirection: 'row', gap: 18, marginTop: 16 },
  stat: { color: '#8993a7', fontSize: 13, fontWeight: '600' },
});
