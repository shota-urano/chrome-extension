(() => {
    function normalize(url, { stripHash = true, stripSearch = false } = {}) {
      try {
        const u = new URL(url, location.href);
        if (stripHash) u.hash = "";
        if (stripSearch) u.search = "";
        return u.toString();
      } catch { return null; }
    }
  
    function collectLinks({ sameOriginOnly = true, stripHash = true, stripSearch = false } = {}) {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const set = new Set();
      for (const a of anchors) {
        const n = normalize(a.getAttribute('href'), { stripHash, stripSearch });
        if (!n) continue;
        if (sameOriginOnly && new URL(n).origin !== location.origin) continue;
        set.add(n);
      }
      return Array.from(set);
    }
  
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === "COLLECT_LINKS") {
        const urls = collectLinks(msg.options || {});
        sendResponse({ urls });
        return true; // 念のため：非同期応答継続フラグ
      }
    });
  })();
  