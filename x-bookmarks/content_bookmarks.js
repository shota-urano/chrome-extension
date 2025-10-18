// ====== XBM Content Script (guard against double-injection) ======
if (window.__XBM_CS_ACTIVE) {
    console.log('[XBM] content script already active, skipping duplicate init');
  } else {
    window.__XBM_CS_ACTIVE = true;
  
    console.log('[XBM] content script loaded:', location.href);
  
    // 内部キャッシュ: ツイートID → article要素
    window.__XBM_ARTICLE_BY_ID = window.__XBM_ARTICLE_BY_ID || new Map();
  
    // ---------- overlay ----------
    function ensureOverlay() {
      let el = document.getElementById('xbm-overlay');
      if (el) return el;
      el = document.createElement('div');
      el.id = 'xbm-overlay';
      Object.assign(el.style, {
        position: 'fixed',
        zIndex: 999999,
        right: '16px',
        top: '16px',
        padding: '10px 12px',
        background: 'rgba(0,0,0,0.78)',
        color: '#fff',
        borderRadius: '8px',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        fontSize: '13px',
        lineHeight: '1.4',
        maxWidth: '360px',
        pointerEvents: 'auto',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)'
      });
      el.textContent = 'XBM: ready';
      document.body.appendChild(el);
      return el;
    }
    function setOverlay(text) { ensureOverlay().textContent = text; }
    function showToast(text, ms = 1800) {
      ensureOverlay().textContent = text;
      setTimeout(() => { const el = document.getElementById('xbm-overlay'); if (el) el.remove(); }, ms);
    }
  
    // ---------- utils ----------
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  
    function cleanURL(u) {
      try {
        const url = new URL(u, location.origin);
        ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','s'].forEach(p => url.searchParams.delete(p));
        return url.toString();
      } catch { return u; }
    }
  
    function getArticles() {
      return Array.from(document.querySelectorAll('main article'));
    }
  
    // クリック時にフォーカスが aria-hidden 要素に残らないように配慮
    function safeClick(el) {
      try {
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        const ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        el.dispatchEvent(ev);
        setTimeout(() => {
          const ae = document.activeElement;
          if (ae && (ae.getAttribute('aria-hidden') === 'true' || ae?.closest?.('[aria-hidden="true"]'))) {
            if (typeof ae.blur === 'function') ae.blur();
            document.body.focus?.();
          }
        }, 0);
        return true;
      } catch {
        try { el.click(); return true; } catch { return false; }
      }
    }
  
    // 「もっと見る」を確実に開く（多言語対応）
    function expandShowMoreInArticle(article) {
      const cands = Array.from(article.querySelectorAll('a,button,span'))
        .filter(el => {
          const t = (el.innerText || '').trim().toLowerCase();
          return /show more|もっと見る|もっと表示|もっと読む/.test(t);
        });
      let clicked = 0;
      for (const el of cands) { if (safeClick(el)) clicked++; }
      return clicked;
    }
  
    // ---------- core extractors ----------
    function extractTweetFromArticle(article) {
      let id = null, slug = null;
      const anchors = article.querySelectorAll('a[href*="/status/"]');
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const m = href.match(/\/([^\/]+)\/status\/(\d+)/);
        if (m) { slug = slug || m[1]; id = id || m[2]; }
        if (id) break;
      }
  
      const textNode = article.querySelector('div[data-testid="tweetText"]');
      let text = '', links = [];
      if (textNode) {
        text = Array.from(textNode.childNodes).map(n => n.innerText ?? n.textContent ?? '').join('').trim();
        links = Array.from(textNode.querySelectorAll('a[href]'))
          .map(a => a.getAttribute('href'))
          .filter(href => href && /^https?:\/\//i.test(href))
          .map(cleanURL);
      } else {
        text = article.innerText?.split('\n').slice(0, 20).join('\n') ?? '';
      }
  
      const mediaImgs = Array.from(article.querySelectorAll('div[data-testid="tweetPhoto"] img[src]'));
      const images = mediaImgs.map(img => cleanURL(img.getAttribute('src')));
  
      const authorName =
        article.querySelector('div[dir="auto"] span')?.innerText ||
        slug || '';
  
      let dateStr = '';
      const timeEl = article.querySelector('time');
      if (timeEl?.dateTime) {
        const d = new Date(timeEl.dateTime);
        if (!Number.isNaN(d.getTime())) dateStr = d.toISOString().slice(0,10);
      }
  
      const url = id ? `https://x.com/i/web/status/${id}` : location.href;
      return { id, slug, text, authorName, date: dateStr, url, links, images, _article: article };
    }
  
    // 指定件数（id有り）まで粘って収集し、ID→article をキャッシュ
    async function collectTopTweets(limit = 5, maxScrolls = 120, idleWaitMs = 800) {
      const seen = new Set();
      const tweets = [];
  
      for (let i = 0; i < maxScrolls; i++) {
        const arts = getArticles();
        setOverlay(`Loading… tweets ${tweets.length}/${limit} (scroll ${i+1}/${maxScrolls})`);
  
        for (const a of arts) {
          if (tweets.length >= limit) break;
          for (let r = 0; r < 2; r++) {
            const c = expandShowMoreInArticle(a);
            if (c) await sleep(250);
          }
          const t = extractTweetFromArticle(a);
          if (t.id && !seen.has(t.id)) {
            seen.add(t.id);
            tweets.push(t);
            // ★ キャッシュ
            try { window.__XBM_ARTICLE_BY_ID.set(t.id, a); } catch {}
          }
        }
        if (tweets.length >= limit) break;
  
        const last = arts[arts.length - 1];
        if (last) {
          last.scrollIntoView({ block: 'end', behavior: 'instant' });
        } else {
          window.scrollBy({ top: Math.max(500, window.innerHeight), behavior: 'instant' });
        }
        await sleep(idleWaitMs);
  
        if (i % 3 === 2) {
          window.scrollBy({ top: 2 * window.innerHeight, behavior: 'instant' });
          await sleep(250);
        }
      }
  
      setOverlay(`Parsed ${tweets.length}/${limit}`);
      return tweets.slice(0, limit);
    }
  
    // ---------- unbookmark helpers ----------
    function findBookmarkButton(article) {
      // data-testid 優先（Xの公式テストID）
      let btn =
        article.querySelector('button[data-testid="bookmark"]') ||
        article.querySelector('button[data-testid="unbookmark"]');
  
      // aria-label の多言語フォールバック
      if (!btn) {
        btn = Array.from(article.querySelectorAll('button[aria-label]')).find(b => {
          const a = (b.getAttribute('aria-label') || '').toLowerCase();
          // 「ブックマーク解除」「削除」「ブックマーク済み」や英語の remove/unbookmark を含むもの
          return /remove|unbookmark|bookmark|ブックマーク解除|削除|ブックマーク済み|ブックマーク/.test(a);
        });
      }
      return btn || null;
    }
  
    function isBookmarkedButton(btn) {
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      // 「解除」「済み」などはブックマーク状態
      if (/remove|unbookmark|ブックマーク解除|ブックマーク済み/.test(aria)) return true;
      // 「ブックマーク」だけの場合は未設定っぽい
      if (/bookmark|ブックマーク/.test(aria)) return false;
      // 手掛かりがなければ unknown
      return null;
    }
  
    async function waitUnbookmarked(article, btn, timeoutMs = 3000) {
      const start = Date.now();
  
      // 親 article がブックマーク一覧から消えるのが最も確実
      const removed = new Promise(resolve => {
        const obs = new MutationObserver(() => {
          if (!document.body.contains(article)) {
            obs.disconnect();
            resolve(true);
          }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { obs.disconnect(); resolve(false); }, timeoutMs + 50);
      });
  
      // ボタンの aria-label 変化もチェック
      const labelChanged = (async () => {
        while (Date.now() - start < timeoutMs) {
          const state = btn.isConnected ? isBookmarkedButton(btn) : null;
          if (state === false) return true; // 未ブックマーク状態になった
          await sleep(120);
        }
        return false;
      })();
  
      const res = await Promise.race([removed, labelChanged]);
      return !!res;
    }
  
    function scrollArticleIntoView(article) {
      try { article.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch {}
    }
  
    async function unbookmarkArticle(article) {
      if (!article || !document.body.contains(article)) return false;
      scrollArticleIntoView(article);
      await sleep(60);
  
      const btn = findBookmarkButton(article);
      if (!btn) return false;
  
      // すでに未ブックマークなら何もしない
      const state = isBookmarkedButton(btn);
      if (state === false) return true;
  
      // クリック → 状態変化待ち
      const clicked = safeClick(btn);
      if (!clicked) return false;
      const ok = await waitUnbookmarked(article, btn, 3000);
      return ok;
    }
  
    function articleForId(id) {
      // 1) キャッシュ優先
      const m = window.__XBM_ARTICLE_BY_ID.get(id);
      if (m && document.body.contains(m)) return m;
  
      // 2) DOM直検索（href から最寄りの article）
      const a = document.querySelector(`a[href*="/status/${id}"]`);
      if (a) {
        const art = a.closest('article');
        if (art) return art;
      }
      return null;
    }
  
    // ---------- messaging ----------
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      (async () => {
        if (msg?.type === 'PING') { sendResponse({ ok: true, href: location.href }); return; }
        if (msg?.type === 'SHOW_TOAST') { showToast(msg.text || 'Done', msg.ms || 1800); sendResponse({ ok: true }); return; }
  
        if (msg?.type === 'FETCH_TOP_BOOKMARKS') {
          const limit = msg.limit || 5;
          const tweets = await collectTopTweets(limit, 120, 900);
          sendResponse({ tweets });
          return;
        }
  
        if (msg?.type === 'UNBOOKMARK_BY_IDS') {
          const ids = new Set(msg.ids || []);
          let count = 0;
          for (const id of ids) {
            let art = articleForId(id);
            if (!art) {
              // 画面に見えていない/仮想リスト外 → 少し探す（軽いスクロール）
              for (let i = 0; i < 6 && !art; i++) {
                window.scrollBy({ top: (i % 2 === 0 ? 1 : -1) * Math.max(400, window.innerHeight), behavior: 'instant' });
                await sleep(200);
                art = articleForId(id);
              }
            }
            if (art) {
              const ok = await unbookmarkArticle(art);
              if (ok) count++;
              // 解除後はキャッシュから除外
              try { window.__XBM_ARTICLE_BY_ID.delete(id); } catch {}
            }
          }
          showToast(`Unbookmarked ${count}/${ids.size}`);
          sendResponse({ removed: count });
          return;
        }
      })();
      return true;
    });
  
  } // end guard
  