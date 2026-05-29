// ── 配置读取 ──────────────────────────────────────────────
function getCfg(key) { return localStorage.getItem(key) || ''; }
function saveCfg(key, val) { localStorage.setItem(key, val); }

// ── 状态 ─────────────────────────────────────────────────
let library = [];
let currentSrcDataUrl = null;
let currentResultBlob = null;

// ── 初始化 ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  setupDragDrop();
  loadSettingsUI();
  await fetchLibrary();
});

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const view = el.dataset.view;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      el.classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view' + view.charAt(0).toUpperCase() + view.slice(1)).classList.add('active');
    });
  });
}

function setupDragDrop() {
  const zone = document.getElementById('dropZone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = '#1a1917'; });
  zone.addEventListener('dragleave', () => { zone.style.borderColor = ''; });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) readFile(file);
  });
}

// ── 图库加载 ──────────────────────────────────────────────
async function fetchLibrary() {
  showLoading(true);
  const sbUrl = getCfg('sbUrl');
  const sbKey = getCfg('sbKey');

  if (sbUrl && sbKey) {
    // 从 Supabase 拉取
    try {
      const res = await fetch(`${sbUrl}/rest/v1/assets?select=*&order=created_at.desc`, {
        headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` }
      });
      if (!res.ok) throw new Error('Supabase 请求失败');
      library = await res.json();
      showToast('图库已从云端同步');
    } catch (e) {
      showToast('云端同步失败，显示本地缓存');
      library = JSON.parse(localStorage.getItem('local_library') || '[]');
    }
  } else {
    // 本地模式
    library = JSON.parse(localStorage.getItem('local_library') || '[]');
  }

  showLoading(false);
  renderLibrary();
  updateFilters();
}

// ── 渲染图库 ──────────────────────────────────────────────
function renderLibrary() {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const brand = document.getElementById('filterBrand')?.value || '';
  const cat = document.getElementById('filterCat')?.value || '';

  const filtered = library.filter(item =>
    (!q || item.name.toLowerCase().includes(q) || item.brand.toLowerCase().includes(q)) &&
    (!brand || item.brand === brand) &&
    (!cat || item.category === cat)
  );

  document.getElementById('statTotal').textContent = library.length;
  document.getElementById('statBrands').textContent = new Set(library.map(i => i.brand)).size;
  document.getElementById('statCats').textContent = new Set(library.map(i => i.category)).size;
  document.getElementById('sideTotal').textContent = library.length + ' 张素材';

  const grid = document.getElementById('libraryGrid');
  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      <p>${library.length ? '没有符合条件的素材' : '图库为空，点击左侧「添加素材」开始'}</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(item => `
    <div class="asset-card">
      <div class="card-img-wrap">
        <img src="${item.image_url || item.dataUrl}" alt="${item.name}" loading="lazy">
        <button class="del-overlay" onclick="deleteItem('${item.id}', event)" aria-label="删除">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="card-body">
        <div class="card-name">${item.name}</div>
        <div class="card-meta">${item.brand} · ${item.category || ''}</div>
      </div>
      <div class="card-actions">
        <button class="card-btn" onclick="downloadItem('${item.id}')">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          下载
        </button>
        <button class="card-btn" onclick="copyItem('${item.id}', this)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          复制
        </button>
      </div>
    </div>`).join('');
}

function updateFilters() {
  const brands = [...new Set(library.map(i => i.brand))].sort();
  const cats = [...new Set(library.map(i => i.category))].sort();

  const fb = document.getElementById('filterBrand');
  const fc = document.getElementById('filterCat');
  fb.innerHTML = '<option value="">全部品牌</option>' + brands.map(b => `<option>${b}</option>`).join('');
  fc.innerHTML = '<option value="">全部品类</option>' + cats.map(c => `<option>${c}</option>`).join('');

  const bl = document.getElementById('brandList');
  if (bl) bl.innerHTML = brands.map(b => `<option value="${b}">`).join('');

  const chips = document.getElementById('brandChips');
  chips.innerHTML = ['全部', ...brands].map((b, i) =>
    `<span class="chip ${i === 0 ? 'active' : ''}" onclick="chipClick(this, '${i === 0 ? '' : b}')">${b}</span>`
  ).join('');
}

function chipClick(el, brand) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('filterBrand').value = brand;
  renderLibrary();
}

// ── 上传流程 ──────────────────────────────────────────────
function onFileChange(e) {
  const file = e.target.files[0];
  if (file) readFile(file);
}

function readFile(file) {
  const reader = new FileReader();
  reader.onload = ev => showSrcPreview(ev.target.result);
  reader.readAsDataURL(file);
}

async function loadUrlPreview() {
  const url = document.getElementById('inUrl').value.trim();
  if (!url) return setUpStatus('请填写图片 URL', 'err');
  setUpStatus('载入中…', 'spin');
  try {
    const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
    const blob = await res.blob();
    const reader = new FileReader();
    reader.onload = e => showSrcPreview(e.target.result);
    reader.readAsDataURL(blob);
  } catch (e) {
    setUpStatus('载入失败，建议上传本地文件', 'err');
  }
}

function showSrcPreview(dataUrl) {
  currentSrcDataUrl = dataUrl;
  currentResultBlob = null;
  document.getElementById('btnSave').disabled = true;
  document.getElementById('srcPreview').innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:contain">`;
  document.getElementById('resultPreview').innerHTML = `<div class="preview-empty"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" opacity=".3"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg><span>点击抠图后显示</span></div>`;
  setUpStatus('原图已载入，点击「开始抠图」', 'ok');
}

async function doRemoveBg() {
  const apiKey = getCfg('rbgKey');
  if (!apiKey) { setUpStatus('请先在「设置」中填写 Remove.bg API Key', 'err'); return; }
  if (!currentSrcDataUrl) return setUpStatus('请先载入原图', 'err');
  setUpStatus('抠图中，请稍候…', 'spin');
  try {
    const blob = dataUrlToBlob(currentSrcDataUrl);
    const fd = new FormData();
    fd.append('image_file', blob, 'img.png');
    fd.append('size', 'auto');
    const res = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST', headers: { 'X-Api-Key': apiKey }, body: fd
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.errors?.[0]?.title || `HTTP ${res.status}`); }
    currentResultBlob = await res.blob();
    const url = URL.createObjectURL(currentResultBlob);
    document.getElementById('resultPreview').innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:contain">`;
    document.getElementById('btnSave').disabled = false;
    setUpStatus('抠图成功！填写信息后点「保存到图库」', 'ok');
  } catch (e) {
    setUpStatus('抠图失败：' + e.message, 'err');
  }
}

async function saveToLibrary() {
  if (!currentResultBlob) return;
  const brand = document.getElementById('inBrand').value.trim() || '未分类品牌';
  const name = document.getElementById('inName').value.trim() || '未命名产品';
  const category = document.getElementById('inCat').value;
  setUpStatus('保存中…', 'spin');
  document.getElementById('btnSave').disabled = true;

  const sbUrl = getCfg('sbUrl');
  const sbKey = getCfg('sbKey');
  const cdnName = getCfg('cdnName');
  const cdnPreset = getCfg('cdnPreset');

  let imageUrl = null;

  // 尝试上传到 Cloudinary
  if (cdnName && cdnPreset) {
    try {
      const fd = new FormData();
      fd.append('file', currentResultBlob, 'asset.png');
      fd.append('upload_preset', cdnPreset);
      fd.append('folder', 'brand-library');
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cdnName}/image/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.secure_url) imageUrl = data.secure_url;
    } catch (e) { console.warn('Cloudinary 上传失败', e); }
  }

  // fallback: base64 存本地
  if (!imageUrl) {
    imageUrl = await blobToDataUrl(currentResultBlob);
  }

  const item = { brand, name, category, image_url: imageUrl, created_at: new Date().toISOString() };

  // 尝试写入 Supabase
  if (sbUrl && sbKey) {
    try {
      const res = await fetch(`${sbUrl}/rest/v1/assets`, {
        method: 'POST',
        headers: {
          'apikey': sbKey,
          'Authorization': `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(item)
      });
      if (!res.ok) throw new Error('Supabase 写入失败');
      const [saved] = await res.json();
      library.unshift(saved);
      setUpStatus('已保存到云端图库，同事可立即看到', 'ok');
      showToast('保存成功 ✓');
    } catch (e) {
      saveLocal(item);
      setUpStatus('云端保存失败，已存本地：' + e.message, 'err');
    }
  } else {
    saveLocal(item);
    setUpStatus('已保存到本地（配置云端后可共享）', 'ok');
    showToast('保存成功 ✓');
  }

  document.getElementById('btnSave').disabled = false;
  updateFilters();
  renderLibrary();
}

function saveLocal(item) {
  item.id = Date.now().toString();
  item.dataUrl = item.image_url;
  library.unshift(item);
  localStorage.setItem('local_library', JSON.stringify(library));
}

// ── 图库操作 ──────────────────────────────────────────────
async function deleteItem(id, e) {
  e.stopPropagation();
  if (!confirm('确认删除这张素材？')) return;
  const sbUrl = getCfg('sbUrl');
  const sbKey = getCfg('sbKey');
  if (sbUrl && sbKey) {
    await fetch(`${sbUrl}/rest/v1/assets?id=eq.${id}`, {
      method: 'DELETE',
      headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` }
    }).catch(() => {});
  }
  library = library.filter(i => i.id !== id);
  localStorage.setItem('local_library', JSON.stringify(library));
  renderLibrary();
  updateFilters();
  showToast('已删除');
}

function downloadItem(id) {
  const item = library.find(i => i.id === id || i.id == id);
  if (!item) return;
  const a = document.createElement('a');
  a.href = item.image_url || item.dataUrl;
  a.download = `${item.brand}_${item.name}.png`;
  a.target = '_blank';
  a.click();
}

async function copyItem(id, btn) {
  const item = library.find(i => i.id === id || i.id == id);
  if (!item) return;
  try {
    const res = await fetch(item.image_url || item.dataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> 已复制`;
    setTimeout(() => btn.innerHTML = orig, 1800);
    showToast('图片已复制，可直接粘贴到 PPT');
  } catch (e) {
    showToast('复制失败，请直接下载');
  }
}

// ── 设置 ──────────────────────────────────────────────────
function loadSettingsUI() {
  const keys = ['rbgKey', 'sbUrl', 'sbKey', 'cdnName', 'cdnPreset'];
  keys.forEach(k => {
    const el = document.getElementById(k);
    if (el) el.value = getCfg(k);
  });
  const hasRbg = getCfg('rbgKey');
  const hasSb = getCfg('sbUrl') && getCfg('sbKey');
  document.getElementById('setDot').className = 'dot ' + (hasRbg ? 'ok' : 'err');
  document.getElementById('setMsg').textContent = hasRbg
    ? (hasSb ? '已配置 Remove.bg + 云端存储（共享模式）' : '已配置 Remove.bg（本地模式）')
    : '尚未配置';
}

function saveSettings() {
  const keys = ['rbgKey', 'sbUrl', 'sbKey', 'cdnName', 'cdnPreset'];
  keys.forEach(k => {
    const el = document.getElementById(k);
    if (el) saveCfg(k, el.value.trim());
  });
  loadSettingsUI();
  showToast('配置已保存');
}

function clearAll() {
  if (!confirm('确认清空本地缓存？云端数据不受影响。')) return;
  localStorage.removeItem('local_library');
  library = [];
  renderLibrary();
  updateFilters();
  showToast('本地缓存已清空');
}

// ── 工具函数 ──────────────────────────────────────────────
function dataUrlToBlob(dataUrl) {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u = new Uint8Array(n);
  while (n--) u[n] = bstr.charCodeAt(n);
  return new Blob([u], { type: mime });
}

function blobToDataUrl(blob) {
  return new Promise(res => {
    const reader = new FileReader();
    reader.onload = e => res(e.target.result);
    reader.readAsDataURL(blob);
  });
}

function setUpStatus(msg, state) {
  document.getElementById('upDot').className = 'dot' + (state ? ' ' + state : '');
  document.getElementById('upMsg').textContent = msg;
}

function showLoading(show) {
  document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
