const state = { content: { pictures: [], videos: [], blogs: [], links: [], mangas: [], playlists: [] }, adminToken: sessionStorage.getItem('codershubToken') || null };

// ---------- helpers ----------
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const validSections = ['discover', 'videos', 'playlists', 'pictures', 'blog', 'websites'];
let activeSection = 'discover';
const mobileMenuButton = $('#mobileMenuButton');
let installPrompt = null;

function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> t.classList.remove('show'), 2200);
}

async function api(path, opts = {}){
  opts.headers = Object.assign({}, opts.headers, { 'Content-Type': 'application/json' });
  if (state.adminToken) opts.headers['x-admin-token'] = state.adminToken;
  const res = await fetch(path, opts);
  const data = await res.json().catch(()=> ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

// ---------- tabs (public) ----------
function showSection(section, updateHistory = true){
  if (!validSections.includes(section)) section = 'discover';
  activeSection = section;
  $$('#mainTabs .tab').forEach(button => button.classList.toggle('active', button.dataset.tab === section));
  $$('.panel').forEach(panel => panel.classList.toggle('active', panel.id === `panel-${section}`));
  $('#mainTabs').classList.remove('mobile-open');
  mobileMenuButton.setAttribute('aria-expanded', 'false');
  mobileMenuButton.setAttribute('aria-label', 'Open menu');
  if (updateHistory) {
    $('#detailView').classList.remove('show');
    $('#detailView').setAttribute('aria-hidden', 'true');
    history.pushState({ section: 'discover' }, '', '#discover');
    history.replaceState({ section }, '', `#${section}`);
  }
  document.title = section === 'discover' ? 'CodersHub' : `${section === 'blog' ? 'Notes' : section[0].toUpperCase() + section.slice(1)} | CodersHub`;
}

$$('#mainTabs .tab').forEach(button => {
  button.addEventListener('click', () => showSection(button.dataset.tab));
});
mobileMenuButton.addEventListener('click', () => {
  const isOpen = $('#mainTabs').classList.toggle('mobile-open');
  mobileMenuButton.setAttribute('aria-expanded', String(isOpen));
  mobileMenuButton.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
});

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  $('#installAppButton').hidden = false;
});
$('#installAppButton').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('#installAppButton').hidden = true;
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  $('#installAppButton').hidden = true;
  toast('CodersHub installed');
});

// ---------- load + render public content ----------
async function loadContent(){
  state.content = await api('/api/content');
  $('#statVideos').textContent = state.content.videos.length;
  $('#statPictures').textContent = state.content.pictures.length;
  $('#statJournals').textContent = state.content.blogs.length;
  $('#statLinks').textContent = (state.content.links || []).length;
  renderDiscover();
  renderPictures();
  renderVideos();
  renderPlaylists();
  renderBlog();
  renderLinks();
  if (state.adminToken) renderAdminLists();
}

function renderDiscover(){
  const videos = [...state.content.videos].sort((a, b) => b.addedAt - a.addedAt).slice(0, 6);
  const pictures = [...state.content.pictures].sort((a, b) => b.addedAt - a.addedAt).slice(0, 6);
  const journals = [...state.content.blogs].sort((a, b) => b.addedAt - a.addedAt).slice(0, 6);
  const videosGrid = $('#discoverVideosGrid');
  const picturesGrid = $('#discoverPicturesGrid');
  const journalsGrid = $('#discoverJournalsGrid');
  videosGrid.innerHTML = videos.map(item => `<article class="discover-card discover-video" data-id="${escAttr(item.id)}"><div class="media-thumb">${videoMarkup(item, true)}</div><div class="discover-card-copy"><span>Video</span><strong>${esc(item.title || 'Untitled video')}</strong></div></article>`).join('');
  picturesGrid.innerHTML = pictures.map(item => `<article class="discover-card discover-picture" data-id="${escAttr(item.id)}"><img src="${escAttr(firstPicture(item))}" alt="${escAttr(item.caption || '')}" loading="lazy"><div class="discover-card-copy"><span>Picture</span><strong>${esc(item.caption || 'Untitled picture')}</strong></div></article>`).join('');
  journalsGrid.innerHTML = journals.map(item => `<article class="discover-card journal-card discover-journal" data-id="${escAttr(item.id)}"><div class="discover-card-copy"><span>Journal</span><strong>${esc(item.title)}</strong><p>${esc((item.body || '').slice(0, 130))}</p></div></article>`).join('');
  $('#discoverVideosEmpty').classList.toggle('show', videos.length === 0);
  $('#discoverPicturesEmpty').classList.toggle('show', pictures.length === 0);
  $('#discoverJournalsEmpty').classList.toggle('show', journals.length === 0);
  videosGrid.querySelectorAll('.discover-video').forEach(card => card.addEventListener('click', () => openDetail('video', card.dataset.id)));
  picturesGrid.querySelectorAll('.discover-picture').forEach(card => card.addEventListener('click', () => openDetail('picture', card.dataset.id)));
  journalsGrid.querySelectorAll('.discover-journal').forEach(card => card.addEventListener('click', () => openJournal(card.dataset.id)));
}

$$('[data-discover-tab]').forEach(button => button.addEventListener('click', () => showSection(button.dataset.discoverTab)));

function renderPictures(){
  const grid = $('#picturesGrid');
  const pics = state.content.pictures;
  grid.innerHTML = pics.map(p => `
    <article class="pic-card" data-id="${escAttr(p.id)}">
      ${pictureCardMarkup(p)}
      ${p.caption ? `<div class="cap">${esc(p.caption)}</div>` : ''}
    </article>`).join('');
  $('#picturesEmpty').classList.toggle('show', pics.length === 0);
  grid.querySelectorAll('.pic-card').forEach(card=>{
    card.addEventListener('click', event=>{
      if (event.target.closest('.picture-next, .picture-prev')) return;
      const p = pics.find(x=>x.id === card.dataset.id);
      openDetail('picture', p.id);
    });
    card.querySelector('.picture-next')?.addEventListener('click', event => changePictureCard(event, 1));
    card.querySelector('.picture-prev')?.addEventListener('click', event => changePictureCard(event, -1));
  });
}

function pictureCardMarkup(picture){
  const urls = pictureUrls(picture);
  const controls = urls.length > 1
    ? `<div class="picture-controls"><button class="picture-prev" type="button" aria-label="Previous image">&#8592;</button><span class="picture-position">1 / ${urls.length}</span><button class="picture-next" type="button" aria-label="Next image">&#8594;</button></div>`
    : '';
  return `<div class="picture-carousel" data-index="0" data-urls="${escAttr(JSON.stringify(urls))}"><img src="${escAttr(urls[0] || '')}" alt="${escAttr(picture.caption)}" loading="lazy">${controls}</div>`;
}

function changePictureCard(event, direction){
  const carousel = event.currentTarget.closest('.picture-carousel');
  const urls = JSON.parse(carousel.dataset.urls || '[]');
  if (urls.length < 2) return;
  const nextIndex = (Number(carousel.dataset.index) + direction + urls.length) % urls.length;
  carousel.dataset.index = String(nextIndex);
  const image = carousel.querySelector('img');
  image.src = urls[nextIndex];
  carousel.querySelector('.picture-position').textContent = `${nextIndex + 1} / ${urls.length}`;
}

function pictureUrls(picture){
  return Array.isArray(picture.images) && picture.images.length ? picture.images : [picture.url];
}

function firstPicture(picture){
  return pictureUrls(picture)[0] || '';
}

function renderVideos(){
  const grid = $('#videosGrid');
  const vids = state.content.videos;
  grid.innerHTML = vids.map(v => `
    <article class="video-card" data-id="${escAttr(v.id)}">
      <div class="frame-wrap">${videoMarkup(v)}</div>
      ${v.title ? `<div class="vtitle">${esc(v.title)}</div>` : ''}
    </article>`).join('');
  $('#videosEmpty').classList.toggle('show', vids.length === 0);
  grid.querySelectorAll('.video-card').forEach(card => card.addEventListener('click', event => {
    if (event.target.closest('video')) return;
    openDetail('video', card.dataset.id);
  }));
}

function renderPlaylists(){
  const grid = $('#playlistsGrid');
  const playlists = state.content.playlists || [];
  grid.innerHTML = playlists.map(playlist => {
    const videos = playlist.videoIds.map(id => state.content.videos.find(video => video.id === id)).filter(Boolean);
    return `<article class="playlist-card" data-id="${escAttr(playlist.id)}"><div class="playlist-card-head"><span class="eyebrow">${videos.length} videos</span><h3>${esc(playlist.title)}</h3>${playlist.description ? `<p>${esc(playlist.description)}</p>` : ''}</div><div class="playlist-items">${videos.slice(0, 3).map((video, index) => `<span><b>${index + 1}</b>${esc(video.title || 'Untitled video')}</span>`).join('')}</div><button class="btn ghost small playlist-open" type="button">Open playlist</button></article>`;
  }).join('');
  $('#playlistsEmpty').classList.toggle('show', playlists.length === 0);
  grid.querySelectorAll('.playlist-card').forEach(card => card.addEventListener('click', event => {
    if (event.target.closest('.playlist-open') || event.currentTarget === card) openDetail('playlist', card.dataset.id);
  }));
}

function renderBlog(){
  const list = $('#blogList');
  const posts = state.content.blogs;
  list.innerHTML = posts.map(b => `
    <div class="blog-item" data-id="${b.id}">
      <h3>${esc(b.title)}</h3>
      <p class="excerpt">${esc((b.body||'').slice(0,140))}${(b.body||'').length>140?'…':''}</p>
      <p class="meta">${new Date(b.addedAt).toLocaleDateString()}</p>
    </div>`).join('');
  $('#blogEmpty').classList.toggle('show', posts.length === 0);
  list.querySelectorAll('.blog-item').forEach(item=>{
    item.addEventListener('click', ()=>{
      openJournal(item.dataset.id);
    });
  });
}

function videoMarkup(video, preview = false){
  const source = video.embed || '';
  if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(source)) {
    return `<video ${preview ? '' : 'controls'} playsinline preload="metadata" src="${escAttr(source)}"></video>`;
  }
  return `<iframe src="${escAttr(source)}" loading="lazy" title="${escAttr(video.title || 'CodersHub video')}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
}

function openJournal(id){
  openDetail('journal', id);
}

function interactionBar(type, id){
  const liked = localStorage.getItem(`codershubLike:${type}:${id}`) === 'true';
  return `<div class="detail-actions"><button class="detail-action like-action${liked ? ' liked' : ''}" data-action="like" data-type="${type}" data-id="${escAttr(id)}" aria-pressed="${liked}">${liked ? 'Liked' : 'Like'}</button><button class="detail-action" data-action="share" data-type="${type}" data-id="${escAttr(id)}">Share</button></div>`;
}

function recommendationMarkup(currentId){
  const recommendations = state.content.videos
    .filter(video => video.id !== currentId)
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, 6);
  if (!recommendations.length) return '';
  return `<aside class="recommendations"><p class="eyebrow">Up next</p><h2>Recommended videos</h2>${recommendations.map(video => `<button class="recommendation-card" data-recommendation-id="${escAttr(video.id)}"><span class="recommendation-thumb">${videoThumbnail(video)}</span><span><strong>${esc(video.title || 'Untitled video')}</strong><small>From CodersHub</small></span></button>`).join('')}</aside>`;
}

function videoThumbnail(video){
  const match = (video.embed || '').match(/(?:youtube\.com\/embed\/|youtu\.be\/)([\w-]{11})/);
  return match ? `<img src="https://img.youtube.com/vi/${match[1]}/mqdefault.jpg" alt="">` : '<span class="recommendation-placeholder">Video</span>';
}

function openDetail(type, id){
  history.pushState({ section: activeSection, detail: { type, id } }, '', `#${activeSection}/${type}/${encodeURIComponent(id)}`);
  renderDetail(type, id);
}

function renderDetail(type, id){
  const item = type === 'picture'
    ? state.content.pictures.find(entry => entry.id === id)
    : type === 'video'
      ? state.content.videos.find(entry => entry.id === id)
      : type === 'playlist'
        ? (state.content.playlists || []).find(entry => entry.id === id)
        : state.content.blogs.find(entry => entry.id === id);
  if (!item) return;
  const detailContent = $('#detailContent');
  if (type === 'picture') {
    detailContent.innerHTML = `<p class="eyebrow">Picture collection</p><h1>${esc(item.caption || 'Untitled picture')}</h1>${interactionBar(type, id)}<div class="detail-gallery picture-gallery">${pictureUrls(item).map(url => `<img src="${escAttr(url)}" alt="${escAttr(item.caption || '')}" loading="lazy">`).join('')}</div>`;
  } else if (type === 'video') {
    detailContent.innerHTML = `<div class="watch-layout"><div class="watch-main"><p class="eyebrow">Video</p><div class="detail-media detail-video">${videoMarkup(item)}</div><h1>${esc(item.title || 'Untitled video')}</h1>${interactionBar(type, id)}</div>${recommendationMarkup(id)}</div>`;
  } else if (type === 'playlist') {
    const videos = item.videoIds.map(videoId => state.content.videos.find(video => video.id === videoId)).filter(Boolean);
    detailContent.innerHTML = `<p class="eyebrow">Video playlist</p><h1>${esc(item.title)}</h1>${item.description ? `<p class="detail-lede">${esc(item.description)}</p>` : ''}<div class="playlist-detail-list">${videos.map((video, index) => `<article class="playlist-detail-item"><span class="playlist-number">${index + 1}</span><div><h2>${esc(video.title || 'Untitled video')}</h2><button class="btn ghost small" data-playlist-video="${escAttr(video.id)}" type="button">Watch video</button></div></article>`).join('')}</div>`;
  } else {
    detailContent.innerHTML = `<p class="eyebrow">Journal</p><h1>${esc(item.title)}</h1><p class="detail-date">${new Date(item.addedAt).toLocaleDateString()}</p>${interactionBar(type, id)}${item.images?.length ? `<div class="detail-gallery">${item.images.map(url => `<img src="${escAttr(url)}" alt="" loading="lazy">`).join('')}</div>` : ''}<div class="detail-body">${esc(item.body || '')}</div>`;
  }
  $$('#detailContent [data-action]').forEach(button => button.addEventListener('click', handleDetailAction));
  $$('#detailContent [data-recommendation-id]').forEach(button => button.addEventListener('click', () => openDetail('video', button.dataset.recommendationId)));
  $$('#detailContent [data-playlist-video]').forEach(button => button.addEventListener('click', () => openDetail('video', button.dataset.playlistVideo)));
  $('#detailView').classList.add('show');
  $('#detailView').setAttribute('aria-hidden', 'false');
  document.title = `${item.title || item.caption || 'Picture'} | CodersHub`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function handleDetailAction(event){
  const button = event.currentTarget;
  const type = button.dataset.type;
  const id = button.dataset.id;
  if (button.dataset.action === 'like') {
    const key = `codershubLike:${type}:${id}`;
    const liked = localStorage.getItem(key) === 'true';
    localStorage.setItem(key, String(!liked));
    button.classList.toggle('liked', !liked);
    button.setAttribute('aria-pressed', String(!liked));
    button.textContent = liked ? 'Like' : 'Liked';
    return;
  }

  const item = type === 'picture'
    ? state.content.pictures.find(entry => entry.id === id)
    : type === 'video'
      ? state.content.videos.find(entry => entry.id === id)
      : state.content.blogs.find(entry => entry.id === id);
  const title = item?.title || item?.caption || 'CodersHub collection';
  const shareData = { title, text: `View ${title} on CodersHub`, url: window.location.href };
  try {
    if (navigator.share) await navigator.share(shareData);
    else {
      await navigator.clipboard.writeText(window.location.href);
      toast('Link copied');
    }
  } catch (error) {
    if (error.name !== 'AbortError') toast('Unable to share this link');
  }
}

function renderLinks(){
  const links = state.content.links || [];
  $('#linksList').innerHTML = links.map(link => `
    <article class="link-item">
      <div class="lt"><h3>${esc(link.title)}</h3><div class="url">${esc(link.url)}</div>${link.description ? `<p class="desc">${esc(link.description)}</p>` : ''}</div>
      <a class="visit" href="${escAttr(link.url)}" target="_blank" rel="noopener noreferrer">Visit</a>
    </article>`).join('');
  $('#linksEmpty').classList.toggle('show', links.length === 0);
}

function esc(s=''){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function escAttr(s=''){ return esc(s).replace(/"/g,'&quot;'); }

function closeDetail(){
  if ($('#detailView').classList.contains('show')) history.back();
}

function renderSearchResults(query){
  const normalized = query.trim().toLowerCase();
  const results = [
    ...state.content.pictures.map(item => ({ ...item, type: 'picture', label: item.caption || 'Untitled picture', text: `${item.caption} ${item.url}` })),
    ...state.content.videos.map(item => ({ ...item, type: 'video', label: item.title || 'Untitled video', text: `${item.title} ${item.embed}` })),
    ...(state.content.playlists || []).map(item => ({ ...item, type: 'playlist', label: item.title, text: `${item.title} ${item.description}` })),
    ...state.content.blogs.map(item => ({ ...item, type: 'journal', label: item.title, text: `${item.title} ${item.body}` })),
    ...(state.content.links || []).map(item => ({ ...item, type: 'link', label: item.title || item.url, text: `${item.title} ${item.url} ${item.description}` }))
  ].filter(item => !normalized || item.text.toLowerCase().includes(normalized)).slice(0, 30);
  $('#searchResults').innerHTML = results.length
    ? results.map(item => `<button class="search-result" data-type="${item.type}" data-id="${escAttr(item.id || '')}"><span>${esc(item.type)}</span><strong>${esc(item.label)}</strong><small>${esc(item.caption || item.title || item.url || '')}</small></button>`).join('')
    : '<p class="muted">No matching items found.</p>';
  $$('.search-result').forEach(result => result.addEventListener('click', () => {
    $('#searchOverlay').classList.remove('show');
    if (result.dataset.type === 'link') {
      showSection('websites');
      return;
    }
    openDetail(result.dataset.type, result.dataset.id);
  }));
}

$('#searchButton').addEventListener('click', () => { $('#searchOverlay').classList.add('show'); $('#searchInput').focus(); });
$('#searchClose').addEventListener('click', () => $('#searchOverlay').classList.remove('show'));
$('#searchOverlay').addEventListener('click', event => { if (event.target.id === 'searchOverlay') $('#searchOverlay').classList.remove('show'); });
$('#searchInput').addEventListener('input', event => renderSearchResults(event.target.value));
$('#detailBack').addEventListener('click', closeDetail);
window.addEventListener('popstate', event => {
  const view = event.state || {};
  if (view.detail) {
    showSection(view.section || 'discover', false);
    renderDetail(view.detail.type, view.detail.id);
  } else {
    $('#detailView').classList.remove('show');
    $('#detailView').setAttribute('aria-hidden', 'true');
    showSection(view.section || 'discover', false);
  }
});

const initialSection = (location.hash.slice(1).split('/')[0] || 'discover');
history.replaceState({ section: validSections.includes(initialSection) ? initialSection : 'discover' }, '', location.hash || '#discover');
showSection(validSections.includes(initialSection) ? initialSection : 'discover', false);

// ---------- lightbox / reader close ----------
$('#lightboxClose').addEventListener('click', ()=> $('#lightbox').classList.remove('show'));
$('#lightbox').addEventListener('click', e=>{ if(e.target.id==='lightbox') $('#lightbox').classList.remove('show'); });
$('#readerClose').addEventListener('click', ()=> $('#reader').classList.remove('show'));
$('#reader').addEventListener('click', e=>{ if(e.target.id==='reader') $('#reader').classList.remove('show'); });

// ---------- admin login ----------
function openAdminEntry(){
  window.open('/admin.html', 'codershubAdmin');
}
$('#adminEntryBtn').addEventListener('click', openAdminEntry);
document.addEventListener('keydown', e=>{
  if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'a') openAdminEntry();
});
function openAdminFromUrl(){
  if (window.location.hash === '#admin' || new URLSearchParams(window.location.search).has('admin')) openAdminEntry();
}
window.addEventListener('hashchange', openAdminFromUrl);
openAdminFromUrl();
$('#loginCancel').addEventListener('click', ()=> $('#loginOverlay').classList.remove('show'));
$('#loginSubmit').addEventListener('click', submitLogin);
$('#loginPassword').addEventListener('keydown', e=>{ if(e.key==='Enter') submitLogin(); });

async function submitLogin(){
  const password = $('#loginPassword').value;
  try{
    const { token } = await api('/api/admin/login', { method:'POST', body: JSON.stringify({ password }) });
    state.adminToken = token;
    sessionStorage.setItem('codershubToken', token);
    $('#loginOverlay').classList.remove('show');
    openAdmin();
  }catch(e){ $('#loginError').textContent = e.message; }
}

function openAdmin(){
  $('#adminOverlay').classList.add('show');
  renderAdminLists();
}
$('#adminClose').addEventListener('click', ()=> $('#adminOverlay').classList.remove('show'));
$('#logoutBtn').addEventListener('click', async ()=>{
  try{ await api('/api/admin/logout', { method:'POST' }); }catch(e){}
  state.adminToken = null;
  sessionStorage.removeItem('codershubToken');
  $('#adminOverlay').classList.remove('show');
});

// ---------- admin tabs ----------
$$('#adminTabs .atab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    $$('#adminTabs .atab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    $$('.apanel').forEach(p=>p.classList.remove('active'));
    $('#' + btn.dataset.atab).classList.add('active');
  });
});

function adminErr(msg){ $('#adminError').textContent = msg || ''; }

// ---------- admin: videos ----------
$('#addVideoBtn').addEventListener('click', async ()=>{
  adminErr('');
  try{
    await api('/api/admin/videos', { method:'POST', body: JSON.stringify({
      url: $('#videoUrlInput').value, title: $('#videoTitleInput').value
    })});
    $('#videoUrlInput').value=''; $('#videoTitleInput').value='';
    toast('Video added');
    await loadContent();
  }catch(e){ adminErr(e.message); }
});

// ---------- admin: pictures ----------
$('#addPicturesBtn').addEventListener('click', async ()=>{
  adminErr('');
  try{
    const { added } = await api('/api/admin/pictures', { method:'POST', body: JSON.stringify({
      urls: $('#pictureUrlsInput').value, caption: $('#pictureCaptionInput').value
    })});
    $('#pictureUrlsInput').value=''; $('#pictureCaptionInput').value='';
    toast(`${added.length} picture${added.length===1?'':'s'} added`);
    await loadContent();
  }catch(e){ adminErr(e.message); }
});

// ---------- admin: blog ----------
$('#addBlogBtn').addEventListener('click', async ()=>{
  adminErr('');
  try{
    await api('/api/admin/blogs', { method:'POST', body: JSON.stringify({
      title: $('#blogTitleInput').value, body: $('#blogBodyInput').value
    })});
    $('#blogTitleInput').value=''; $('#blogBodyInput').value='';
    toast('Post published');
    await loadContent();
  }catch(e){ adminErr(e.message); }
});

// ---------- admin: websites ----------
$('#addLinkBtn').addEventListener('click', async ()=>{
  adminErr('');
  try{
    await api('/api/admin/links', { method:'POST', body: JSON.stringify({
      url: $('#linkUrlInput').value, title: $('#linkTitleInput').value, description: $('#linkDescriptionInput').value
    })});
    $('#linkUrlInput').value=''; $('#linkTitleInput').value=''; $('#linkDescriptionInput').value='';
    toast('Website added');
    await loadContent();
  }catch(e){ adminErr(e.message); }
});

// ---------- admin: existing-item lists with delete ----------
function renderAdminLists(){
  const c = state.content;
  $('#adminVideoList').innerHTML = c.videos.map(v => rowHtml(v.id, v.title || v.embed, 'videos')).join('');
  $('#adminPictureList').innerHTML = c.pictures.map(p => rowHtml(p.id, p.caption || p.url, 'pictures')).join('');
  $('#adminBlogList').innerHTML = c.blogs.map(b => rowHtml(b.id, b.title, 'blogs')).join('');
  $('#adminLinkList').innerHTML = (c.links || []).map(l => rowHtml(l.id, l.title || l.url, 'links')).join('');
  $$('.admin-row button').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      if (!window.confirm('Delete this item permanently?')) return;
      try{
        await api(`/api/admin/${btn.dataset.type}/${btn.dataset.id}`, { method:'DELETE' });
        toast('Deleted');
        await loadContent();
      }catch(e){ adminErr(e.message); }
    });
  });
}
function rowHtml(id, label, type){
  return `<div class="admin-row"><span class="rt">${esc(label)}</span><button data-id="${id}" data-type="${type}" type="button">Delete</button></div>`;
}

loadContent();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
