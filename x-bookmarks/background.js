function log(...a){ console.log('[XBM]', ...a); }
function err(...a){ console.error('[XBM]', ...a); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function getCfg() {
  return chrome.storage.sync.get({
    saveDir: '',              // ダウンロード直下（空）
    mediaSubfolder: '',       // 画像も直下（空）。必要なら 'media'
    filename: '{date} {author} {id}.md',
    limit: 5,
    unbookmark: false,
    saveImages: true,
    embedLocalImages: true
  });
}

// ---------- safe path helpers ----------
function toSafeBase(s) {
  // 制御文字除去
  s = (s || '').replace(/[\u0000-\u001F\u007F]/g, ' ');
  // 禁止文字（Windowsファイル名）
  s = s.replace(/[\\/:*?"<>|]/g, ' ');
  // 余計な空白の圧縮
  s = s.replace(/\s+/g, ' ').trim();
  // 先頭・末尾のドット/スペースを除去
  s = s.replace(/^[.\s]+|[.\s]+$/g, '');
  // 予約語を回避
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (reserved.test(s)) s = `_${s}`;
  // 長すぎるのを適度に切る（拡張子は別で付与）
  const MAX = 120;
  if (s.length > MAX) s = s.slice(0, MAX);
  // 空潰れ対策
  if (!s) s = 'note';
  return s;
}

function pathJoin(...parts) {
  const p = parts.filter(Boolean).join('/').replace(/\/\/+/g, '/').replace(/^\/+|\/+$/g, '');
  // Chrome downloads は絶対パス・ルート始まり不可
  if (p.startsWith('../')) return p.replace(/^\.+/, '');
  return p;
}

function safeJoin(dir, name) {
  const joined = pathJoin(dir || '', name || '');
  // まだ絶対っぽい/空などは弾く
  if (!joined || joined.startsWith('/')) return toSafeBase(name || 'note');
  return joined;
}

// ---------- downloads ----------
async function downloadMarkdown(path, content) {
  const dataUrl = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(content);
  await chrome.downloads.download({
    url: dataUrl,
    filename: path,
    conflictAction: "uniquify",
    saveAs: false
  });
}

async function downloadURL(path, url) {
  await chrome.downloads.download({
    url,
    filename: path,
    conflictAction: "uniquify",
    saveAs: false
  });
}

// ---------- markdown ----------
function mdForTweet(t, relImages, links) {
  const safe = (s) => (s || '').replace(/"/g, '\\"');
  const fm = [
    '---',
    `tweet_id: "${safe(t.id)}"`,
    `"x url": "${safe(t.url)}"`,
    `"post date": "${safe(t.date)}"`,
    '---'
  ].join('\n');

  const lines = [];
  lines.push(fm, '', `> ${t.text || ''}`, '');
  if (relImages?.length) {
    lines.push('### Images');
    for (const p of relImages) lines.push(`![](${p})`);
    lines.push('');
  }
  if (links?.length) {
    lines.push('### Links');
    for (const u of links) lines.push(`- ${u}`);
    lines.push('');
  }
  lines.push(`- URL: ${t.url}`, '');
  return lines.join('\n');
}

function buildBaseName(cfg, t) {
  const author = toSafeBase(t.authorName || t.slug || 'unknown');
  const date = toSafeBase(t.date || '');
  const id = toSafeBase(t.id || '');
  const slug = toSafeBase(t.slug || '');
  let base = (cfg.filename || '{date} {author} {id}.md')
    .replace('{date}', date)
    .replace('{author}', author)
    .replace('{id}', id)
    .replace('{slug}', slug);
  base = toSafeBase(base);
  // 拡張子を強制
  if (!/\.md$/i.test(base)) base += '.md';
  return base;
}

async function saveOneTweet(cfg, t) {
  const baseName = buildBaseName(cfg, t);

  // .md の保存パス（直下 or saveDir 直下）
  const mdPath = safeJoin(cfg.saveDir, baseName);

  // 画像の保存（直下 or saveDir/mediaSubfolder）
  const mediaDir = pathJoin(cfg.saveDir || '', cfg.mediaSubfolder || '');

  let relImages = [];
  if (cfg.saveImages && t.images?.length) {
    let idx = 1;
    for (const imgUrl of t.images) {
      const extMatch = (imgUrl.split('?')[0].match(/\.(jpg|jpeg|png|webp|gif)$/i));
      const ext = toSafeBase((extMatch ? extMatch[1] : 'jpg').toLowerCase());
      const imgName = toSafeBase(`${t.id || 'img'}_${idx}.${ext}`);
      const fullPath = safeJoin(mediaDir, imgName);           // 実際にDLするパス
      await downloadURL(fullPath, imgUrl);
      const relPath = pathJoin(cfg.mediaSubfolder || '', imgName); // MDからの相対表記
      relImages.push(relPath || imgName);
      idx++;
    }
  } else if (!cfg.saveImages && t.images?.length && cfg.embedLocalImages) {
    relImages = t.images.slice(); // リモートURLを直接埋め込み
  } else {
    relImages = t.images?.slice() || [];
  }

  const content = mdForTweet(t, relImages, t.links || []);
  await downloadMarkdown(mdPath, content);
}

// ---------- robust tab / content management ----------
async function openOrFocusBookmarks(currentTab) {
  if (currentTab?.url &&
      (currentTab.url.startsWith('https://x.com') ||
       currentTab.url.startsWith('https://twitter.com') ||
       currentTab.url.startsWith('https://mobile.twitter.com')) &&
      currentTab.url.includes('/i/bookmarks')) {
    return currentTab;
  }
  const tab = await chrome.tabs.create({ url: 'https://x.com/i/bookmarks', active: true });
  return tab;
}

async function waitTabComplete(tabId, timeoutMs = 18000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const info = await chrome.tabs.get(tabId).catch(() => null);
    if (info && info.status === 'complete') return true;
    await sleep(250);
  }
  return false;
}

async function ensureContentReady(tabId, tryInject = true, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      if (res?.ok) return true;
    } catch (_) {}
    if (tryInject) {
      try {
        await chrome.scripting.executeScript({ target: { tabId }, files: ['content_bookmarks.js'] });
      } catch (_) {}
    }
    await sleep(300);
  }
  return false;
}

async function fetchTweetsFromTab(tabId, limit) {
  const ready = await ensureContentReady(tabId, true, 8000);
  if (!ready) throw new Error('content not ready');

  for (let i = 0; i < 4; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: 'FETCH_TOP_BOOKMARKS', limit });
      if (res?.tweets?.length) return res.tweets;
    } catch (_) {}
    await sleep(900);
  }
  return [];
}

async function runPipeline(limitOverride) {
  const cfg = await getCfg();
  const chosenLimit = Math.max(1, Math.min(200, Number(limitOverride || cfg.limit) || cfg.limit));

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const bookmarksTab = await openOrFocusBookmarks(activeTab);
  await waitTabComplete(bookmarksTab.id, 18000);

  const tweets = await fetchTweetsFromTab(bookmarksTab.id, chosenLimit);
  log('tweets:', tweets.length);

  if (!tweets.length) {
    await chrome.tabs.sendMessage(bookmarksTab.id, { type: 'SHOW_TOAST', text: 'No bookmarks found.\n- Logged in?\n- Page loaded?\n- UI changed?' }).catch(() => {});
    return;
  }

  for (const t of tweets) {
    log('saving', t.id, t.authorName);
    await saveOneTweet(cfg, t);
  }

  if (cfg.unbookmark) {
    // 解除は画面側で依存 → 命中率向上のため2回試行・待機
    for (let i = 0; i < 2; i++) {
      try {
        const res = await chrome.tabs.sendMessage(bookmarksTab.id, { type: 'UNBOOKMARK_BY_IDS', ids: tweets.map(t => t.id) });
        log('unbookmark try', i+1, 'removed:', res?.removed);
        if (res?.removed >= tweets.length) break;
      } catch (e) {
        err('unbookmark failed', e);
      }
      await sleep(600);
    }
  }

  await chrome.tabs.sendMessage(bookmarksTab.id, { type: 'SHOW_TOAST', text: `Saved ${tweets.length} bookmark(s)` }).catch(() => {});
}

// ---------- popup → background ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'RUN_NOW') {
      await runPipeline(msg.limit);
      sendResponse({ ok: true });
      return;
    }
  })();
  return true;
});
