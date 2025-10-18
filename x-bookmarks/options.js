const els = {
    saveDir: document.getElementById('saveDir'),
    mediaSubfolder: document.getElementById('mediaSubfolder'),
    filename: document.getElementById('filename'),
    limit: document.getElementById('limit'),
    unbookmark: document.getElementById('unbookmark'),
    saveImages: document.getElementById('saveImages'),
    embedLocalImages: document.getElementById('embedLocalImages'),
    save: document.getElementById('save'),
    msg: document.getElementById('msg')
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
    els.limit.value = cfg.limit;
    els.unbookmark.checked = cfg.unbookmark;
    els.saveImages.checked = cfg.saveImages;
    els.embedLocalImages.checked = cfg.embedLocalImages;
  })();
  
  els.save.addEventListener('click', async () => {
    await chrome.storage.sync.set({
      saveDir: els.saveDir.value.trim(),
      mediaSubfolder: els.mediaSubfolder.value.trim(),
      filename: els.filename.value.trim(),
      limit: Math.max(1, Math.min(200, Number(els.limit.value) || 5)),
      unbookmark: els.unbookmark.checked,
      saveImages: els.saveImages.checked,
      embedLocalImages: els.embedLocalImages.checked
    });
    els.msg.textContent = 'Saved';
    setTimeout(() => (els.msg.textContent = ''), 1200);
  });
  