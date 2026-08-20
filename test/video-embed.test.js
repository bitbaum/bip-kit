import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVideoEmbed, videoEmbedSrc } from '../dist/index.js';

test('every allowlisted YouTube URL shape yields the same id', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
    'youtube.com/watch?v=dQw4w9WgXcQ',
  ]) {
    assert.deepEqual(parseVideoEmbed(url), { provider: 'youtube', id: 'dQw4w9WgXcQ' }, url);
  }
});

test('Vimeo URLs yield numeric ids', () => {
  assert.deepEqual(parseVideoEmbed('https://vimeo.com/76979871'), {
    provider: 'vimeo',
    id: '76979871',
  });
});

test('surrounding whitespace is tolerated', () => {
  assert.equal(parseVideoEmbed('  https://vimeo.com/76979871  ').id, '76979871');
});

test('anything off the allowlist is rejected, however video-shaped', () => {
  for (const url of [
    'https://dailymotion.com/video/x123456',
    'https://evil.example.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.example.com/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
    '',
    'not a url at all',
  ]) {
    assert.equal(parseVideoEmbed(url), null, url);
  }
});

test('embed src is the privacy-preserving player, never the raw URL', () => {
  assert.equal(
    videoEmbedSrc({ provider: 'youtube', id: 'dQw4w9WgXcQ' }),
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  );
  assert.equal(
    videoEmbedSrc({ provider: 'vimeo', id: '76979871' }),
    'https://player.vimeo.com/video/76979871',
  );
});
