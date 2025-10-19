// ===== helpers =====
const $ = (s) => document.querySelector(s);

function getToggleOn(id) {
  return $(id).getAttribute("aria-pressed") === "true";
}
function setOutput(arr) {
  $("#output").value = (arr || []).join("\n");
}
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
function isHttpLike(url = "") {
  return /^https?:\/\//i.test(url);
}

// ===== トグル（ON/OFF）の初期化＆クリック切替 =====
// data-on / data-off を使ってテキスト更新。初回に状態に合わせて文言を同期します。
function updateToggleLabel(btn) {
  const on = btn.getAttribute("aria-pressed") === "true";
  btn.textContent = on ? btn.dataset.on : btn.dataset.off;
}
function initToggles() {
  document.querySelectorAll(".toggle").forEach(updateToggleLabel);

  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".toggle");
    if (!btn) return;
    const on = btn.getAttribute("aria-pressed") === "true";
    btn.setAttribute("aria-pressed", on ? "false" : "true");
    updateToggleLabel(btn);
  });
}

// ===== 収集オプション =====
function getOptions() {
  return {
    sameOriginOnly: getToggleOn("#tog-sameOrigin"),
    stripHash:      getToggleOn("#tog-stripHash"),
    stripSearch:    getToggleOn("#tog-stripQuery"),
  };
}

// ===== content.js へメッセージ送信（フォールバック注入つき） =====
async function sendCollectMessage(tabId, options) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "COLLECT_LINKS", options });
  } catch (e) {
    // 受け手がいない場合は注入 → 再送
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return await chrome.tabs.sendMessage(tabId, { type: "COLLECT_LINKS", options });
  }
}

// ===== クリックハンドラ =====
$("#collect").addEventListener("click", async () => {
  const tab = await getActiveTab();
  if (!tab?.id) return setOutput([`[Error] アクティブタブが取得できませんでした。`]);

  if (!isHttpLike(tab.url)) {
    return setOutput([
      `[Notice] このページでは収集できません。`,
      `対象URL: ${tab.url}`,
      `http/https のみ対応（chrome://, WebStore, PDF は不可）`,
    ]);
  }

  try {
    const res = await sendCollectMessage(tab.id, getOptions());
    setOutput(res?.urls || []);
  } catch (e) {
    setOutput([`[Error] 収集に失敗しました: ${String(e)}`]);
  }
});

$("#clear").addEventListener("click", () => setOutput([]));
$("#copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("#output").value); } catch {}
});
$("#download").addEventListener("click", () => {
  const blob = new Blob([$("#output").value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `links_${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

// ===== 起動時：トグル文言を状態に同期 =====
initToggles();
