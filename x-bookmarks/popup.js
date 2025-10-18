const els = {
    saveDir: document.getElementById('saveDir'),
    mediaSubfolder: document.getElementById('mediaSubfolder'),
    filename: document.getElementById('filename'),
    runLimit: document.getElementById('runLimit'),
    defaultLimit: document.getElementById('defaultLimit'),
    unbookmark: document.getElementById('unbookmark'),
    saveImages: document.getElementById('saveImages'),
    embedLocalImages: document.getElementById('embedLocalImages'),
    run: document.getElementById('run'),
    openOptions: document.getElementById('openOptions')
  };
  
  (async function init() {
    const cfg = await chrome.storage.sync.get({
      saveDir: '',
      mediaSubfolder: '',
      filename: '{date} {author} {id}.md',
      limit: 5,
      unbookmark: false,
      saveImages: true,
      embedLocalImages: true
    });
  
    els.saveDir.value = cfg.saveDir;
    els.mediaSubfolder.value = cfg.mediaSubfolder;
    els.filename.value = cfg.filename;
    els.runLimit.value = cfg.limit;
    els.defaultLimit.value = cfg.limit;
    els.unbookmark.checked = cfg.unbookmark;
    els.saveImages.checked = cfg.saveImages;
    els.embedLocalImages.checked = cfg.embedLocalImages;
  })();
  
  async function persist() {
    await chrome.storage.sync.set({
      saveDir: els.saveDir.value.trim(),
      mediaSubfolder: els.mediaSubfolder.value.trim(),
      filename: els.filename.value.trim() || '{date} {author} {id}.md',
      limit: Math.max(1, Math.min(200, Number(els.defaultLimit.value) || 5)),
      unbookmark: els.unbookmark.checked,
      saveImages: els.saveImages.checked,
      embedLocalImages: els.embedLocalImages.checked
    });
  }
  
  els.run.addEventListener('click', async () => {
    await persist();
    const runLimit = Math.max(1, Math.min(200, Number(els.runLimit.value) || 5));
    // 背景に「今すぐ実行」を依頼（limit付き）
    await chrome.runtime.sendMessage({ type: 'RUN_NOW', limit: runLimit }).catch(() => {});
    window.close();
  });
  
  els.openOptions.addEventListener('click', async () => {
    await persist();
    await chrome.runtime.openOptionsPage();
  });
  