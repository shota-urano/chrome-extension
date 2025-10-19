// MV3 service worker
async function fetchAndExtract(url, { stripHash = true, stripSearch = false }) {
    try {
      const res = await fetch(url, { credentials: "omit", redirect: "follow" });
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const anchors = Array.from(doc.querySelectorAll('a[href]'));
      const out = new Set();
      for (const a of anchors) {
        try {
          const u = new URL(a.getAttribute('href'), url);
          if (stripHash) u.hash = "";
          if (stripSearch) u.search = "";
          out.add(u.toString());
        } catch {}
      }
      return Array.from(out);
    } catch {
      return [];
    }
  }
  
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (msg?.type === "BG_CRAWL") {
        const { origin, urls, stripHash, stripSearch, limit = 500 } = msg;
        const seen = new Set();
        const result = new Set();
        for (const u of urls) {
          if (result.size >= limit) break;
          const links = await fetchAndExtract(u, { stripHash, stripSearch });
          for (const l of links) {
            if (new URL(l).origin === origin && !seen.has(l)) {
              seen.add(l);
              result.add(l);
              if (result.size >= limit) break;
            }
          }
        }
        sendResponse(Array.from(result));
      }
    })();
    // 非同期応答を許可
    return true;
  });
  