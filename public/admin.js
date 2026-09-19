const state = {
  content: { pictures: [], videos: [], blogs: [], links: [], mangas: [], playlists: [] },
  adminToken: sessionStorage.getItem('codershubToken') || null
};

const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);

function toast(message){
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2200);
}

async function api(path, options = {}){
  options.headers = Object.assign({}, options.headers, { 'Content-Type': 'application/json' });
  if (state.adminToken) options.headers['x-admin-token'] = state.adminToken;
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function escapeHtml(value = ''){
  return String(value).replace(/[&<>]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[character]));
}

function adminError(message){ $('#adminError').textContent = message || ''; }

async function signIn(){
  $('#loginError').textContent = '';
  try{
    const result = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: $('#loginPassword').value })
    });
    state.adminToken = result.token;
    sessionStorage.setItem('codershubToken', result.token);
    $('#adminLoginCard').hidden = true;
    $('#adminManager').hidden = false;
    await loadContent();
  }catch(error){
    $('#loginError').textContent = error.message;
  }
}

async function loadContent(){
  state.content = await api('/api/content');
  renderAdminLists();
}

function renderAdminLists(){
  const content = state.content;
  $('#adminVideoList').innerHTML = content.videos.map(item => rowHtml(item.id, item.title || item.embed, 'videos')).join('');
  $('#adminPlaylistList').innerHTML = (content.playlists || []).map(item => rowHtml(item.id, `${item.title} (${item.videoIds.length} videos)`, 'playlists')).join('');
  $('#adminPictureList').innerHTML = content.pictures.map(item => rowHtml(item.id, item.caption || item.url, 'pictures')).join('');
  $('#adminBlogList').innerHTML = content.blogs.map(item => rowHtml(item.id, item.title, 'blogs')).join('');
  $('#adminLinkList').innerHTML = (content.links || []).map(item => rowHtml(item.id, item.title || item.url, 'links')).join('');
  $('#playlistVideoPicker').innerHTML = content.videos.length
    ? content.videos.map(item => `<label class="playlist-video-option" draggable="true" data-video-id="${item.id}"><span class="drag-handle" aria-hidden="true">&#8597;</span><input type="checkbox" value="${item.id}"><span>${escapeHtml(item.title || item.embed)}</span></label>`).join('')
    : '<p class="muted">Add videos first, then they will appear here.</p>';
  let draggedOption = null;
  $$('#playlistVideoPicker .playlist-video-option').forEach(option => {
    option.addEventListener('dragstart', () => { draggedOption = option; option.classList.add('dragging'); });
    option.addEventListener('dragend', () => { draggedOption = null; option.classList.remove('dragging'); });
    option.addEventListener('dragover', event => {
      event.preventDefault();
      if (draggedOption && draggedOption !== option) option.parentElement.insertBefore(draggedOption, option);
    });
  });
  $$('.admin-row [data-action="delete"]').forEach(button => button.addEventListener('click', removeItem));
  $$('.admin-row [data-action="edit"]').forEach(button => button.addEventListener('click', editItem));
}

function rowHtml(id, label, type){
  return `<div class="admin-row"><span class="rt">${escapeHtml(label)}</span><span class="row-actions"><button data-id="${id}" data-type="${type}" data-action="edit" type="button">Edit</button><button data-id="${id}" data-type="${type}" data-action="delete" type="button">Delete</button></span></div>`;
}

async function editItem(event){
  const button = event.currentTarget;
  if (button.dataset.type === 'playlists') return editPlaylist(event);
  const item = state.content[button.dataset.type].find(entry => entry.id === button.dataset.id);
  if (!item) return;
  const updates = button.dataset.type === 'videos'
    ? { title: window.prompt('Video title', item.title || ''), embed: window.prompt('Video URL or embed URL', item.embed || '') }
    : button.dataset.type === 'pictures'
      ? { caption: window.prompt('Picture caption', item.caption || '') }
      : button.dataset.type === 'blogs'
        ? { title: window.prompt('Note title', item.title || ''), body: window.prompt('Note body', item.body || '') }
        : { title: window.prompt('Website title', item.title || ''), url: window.prompt('Website URL', item.url || ''), description: window.prompt('Website description', item.description || '') };
  if (Object.values(updates).some(value => value === null)) return;
  try {
    await api(`/api/admin/${button.dataset.type}/${button.dataset.id}`, { method: 'PATCH', body: JSON.stringify(updates) });
    toast('Saved changes');
    await loadContent();
  } catch (error) { adminError(error.message); }
}

async function editPlaylist(event){
  const playlist = state.content.playlists.find(item => item.id === event.currentTarget.dataset.id);
  if (!playlist) return;
  const title = window.prompt('Playlist title', playlist.title);
  if (title === null) return;
  const description = window.prompt('Playlist description', playlist.description || '');
  if (description === null) return;
  const videoIds = window.prompt('Video IDs in order, separated by commas', playlist.videoIds.join(', '));
  if (videoIds === null) return;
  try {
    await api(`/api/admin/playlists/${playlist.id}`, { method: 'PATCH', body: JSON.stringify({ title, description, videoIds: videoIds.split(',').map(value => value.trim()).filter(Boolean) }) });
    toast('Playlist updated');
    await loadContent();
  } catch (error) { adminError(error.message); }
}

async function removeItem(event){
  const button = event.currentTarget;
  if (!window.confirm('Delete this item permanently?')) return;
  try{
    await api(`/api/admin/${button.dataset.type}/${button.dataset.id}`, { method: 'DELETE' });
    toast('Deleted');
    await loadContent();
  }catch(error){ adminError(error.message); }
}

$('#loginSubmit').addEventListener('click', signIn);
$('#loginPassword').addEventListener('keydown', event => { if (event.key === 'Enter') signIn(); });
$('#logoutBtn').addEventListener('click', async () => {
  try{ await api('/api/admin/logout', { method: 'POST' }); }catch(error){}
  state.adminToken = null;
  sessionStorage.removeItem('codershubToken');
  $('#adminManager').hidden = true;
  $('#adminLoginCard').hidden = false;
});

$('#changePasswordBtn').addEventListener('click', async () => {
  adminError('');
  const currentPassword = $('#currentPasswordInput').value;
  const newPassword = $('#newPasswordInput').value;
  const confirmation = $('#confirmPasswordInput').value;
  if (newPassword !== confirmation) {
    adminError('New passwords do not match.');
    return;
  }
  if (newPassword.length < 12 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z\d]/.test(newPassword)) {
    adminError('Use 12+ characters with uppercase, lowercase, a number, and a symbol.');
    return;
  }
  try {
    await api('/api/admin/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    $('#currentPasswordInput').value = '';
    $('#newPasswordInput').value = '';
    $('#confirmPasswordInput').value = '';
    state.adminToken = null;
    sessionStorage.removeItem('codershubToken');
    $('#adminManager').hidden = true;
    $('#adminLoginCard').hidden = false;
    toast('Password changed. Please sign in again.');
  } catch (error) { adminError(error.message); }
});

$('#exportContentBtn').addEventListener('click', async () => {
  try {
    const response = await fetch('/api/admin/export', { headers: { 'x-admin-token': state.adminToken } });
    if (!response.ok) throw new Error('Could not create a backup.');
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'codershub-content.json';
    link.click();
    URL.revokeObjectURL(link.href);
    toast('Backup downloaded');
  } catch (error) { adminError(error.message); }
});

$('#importContentBtn').addEventListener('click', () => $('#importContentInput').click());
$('#importContentInput').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (!window.confirm('Restore this backup and replace the current collection?')) return;
  try {
    const imported = JSON.parse(await file.text());
    await api('/api/admin/import', { method: 'POST', body: JSON.stringify(imported) });
    toast('Backup restored');
    await loadContent();
  } catch (error) { adminError(error.message); }
  event.target.value = '';
});

$$('#adminTabs .atab').forEach(button => button.addEventListener('click', () => {
  $$('#adminTabs .atab').forEach(tab => tab.classList.remove('active'));
  button.classList.add('active');
  $$('.apanel').forEach(panel => panel.classList.remove('active'));
  $('#' + button.dataset.atab).classList.add('active');
}));

$('#addVideoBtn').addEventListener('click', async () => {
  adminError('');
  try{
    await api('/api/admin/videos', { method: 'POST', body: JSON.stringify({ url: $('#videoUrlInput').value, title: $('#videoTitleInput').value }) });
    $('#videoUrlInput').value = ''; $('#videoTitleInput').value = '';
    toast('Video added'); await loadContent();
  }catch(error){ adminError(error.message); }
});

$('#addPlaylistBtn').addEventListener('click', async () => {
  adminError('');
  const sources = $('#playlistSourcesInput').value.trim();
  const videoIds = [...$('#playlistVideoPicker').querySelectorAll('input:checked')].map(input => input.value);
  if (!sources && !videoIds.length) {
    adminError('Add at least one video URL, embed code, or saved video.');
    return;
  }
  try {
    await api('/api/admin/playlists', { method: 'POST', body: JSON.stringify({ title: $('#playlistTitleInput').value, description: $('#playlistDescriptionInput').value, videoIds, sources }) });
    $('#playlistTitleInput').value = '';
    $('#playlistDescriptionInput').value = '';
    $('#playlistSourcesInput').value = '';
    toast('Playlist created');
    await loadContent();
  } catch (error) { adminError(error.message); }
});

$('#addPicturesBtn').addEventListener('click', async () => {
  adminError('');
  try{
    const files = [...$('#pictureFileInput').files];
    if (files.some(file => !file.type.startsWith('image/'))) throw new Error('Only image files can be uploaded.');
    if (files.some(file => file.size > 4 * 1024 * 1024)) throw new Error('Each image must be 4 MB or smaller.');
    const uploadedImages = await Promise.all(files.map(readFileAsDataUrl));
    const urls = uploadedImages.length ? uploadedImages : $('#pictureUrlsInput').value;
    const result = await api('/api/admin/pictures', { method: 'POST', body: JSON.stringify({ urls, caption: $('#pictureCaptionInput').value }) });
    $('#pictureUrlsInput').value = ''; $('#pictureCaptionInput').value = ''; $('#pictureFileInput').value = '';
    toast(`${result.added.length} picture${result.added.length === 1 ? '' : 's'} added`); await loadContent();
  }catch(error){ adminError(error.message); }
});

function readFileAsDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

$('#addBlogBtn').addEventListener('click', async () => {
  adminError('');
  try{
    await api('/api/admin/blogs', { method: 'POST', body: JSON.stringify({ title: $('#blogTitleInput').value, body: $('#blogBodyInput').value, imageUrls: $('#blogImagesInput').value }) });
    $('#blogTitleInput').value = ''; $('#blogBodyInput').value = ''; $('#blogImagesInput').value = '';
    toast('Journal published'); await loadContent();
  }catch(error){ adminError(error.message); }
});

$('#addLinkBtn').addEventListener('click', async () => {
  adminError('');
  try{
    await api('/api/admin/links', { method: 'POST', body: JSON.stringify({ url: $('#linkUrlInput').value, title: $('#linkTitleInput').value, description: $('#linkDescriptionInput').value }) });
    $('#linkUrlInput').value = ''; $('#linkTitleInput').value = ''; $('#linkDescriptionInput').value = '';
    toast('Website added'); await loadContent();
  }catch(error){ adminError(error.message); }
});

async function searchApi(type){
  const query = $(`#api${type === 'images' ? 'Image' : 'Video'}Query`).value.trim();
  const resultsElement = $(`#api${type === 'images' ? 'Image' : 'Video'}Results`);
  if (!query) return;
  resultsElement.innerHTML = '<p class="muted">Searching...</p>';
  try{
    const result = await api(`/api/admin/fetch/${type}?query=${encodeURIComponent(query)}`);
    resultsElement.innerHTML = result.results.map(item => type === 'images'
      ? `<article class="api-result"><img src="${escapeHtml(item.thumbnail || item.url)}" alt=""><div><strong>${escapeHtml(item.caption || 'Picture')}</strong><small>${escapeHtml(item.credit || '')}</small><button class="btn small primary" data-api-url="${escapeHtml(item.url)}" data-api-caption="${escapeHtml(item.caption || '')}">Add picture</button></div></article>`
      : `<article class="api-result"><img src="${escapeHtml(item.thumbnail)}" alt=""><div><strong>${escapeHtml(item.title)}</strong><button class="btn small primary" data-api-embed="${escapeHtml(item.embed)}" data-api-title="${escapeHtml(item.title)}">Add video</button></div></article>`
    ).join('');
    resultsElement.querySelectorAll('[data-api-url]').forEach(button => button.addEventListener('click', () => addApiPicture(button)));
    resultsElement.querySelectorAll('[data-api-embed]').forEach(button => button.addEventListener('click', () => addApiVideo(button)));
  }catch(error){ resultsElement.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`; }
}

async function addApiPicture(button){
  try{
    await api('/api/admin/pictures', { method:'POST', body:JSON.stringify({ urls:button.dataset.apiUrl, caption:button.dataset.apiCaption }) });
    button.textContent = 'Added'; button.disabled = true; await loadContent();
  }catch(error){ adminError(error.message); }
}

async function addApiVideo(button){
  try{
    await api('/api/admin/videos', { method:'POST', body:JSON.stringify({ url:button.dataset.apiEmbed, title:button.dataset.apiTitle }) });
    button.textContent = 'Added'; button.disabled = true; await loadContent();
  }catch(error){ adminError(error.message); }
}

$('#apiImageSearch').addEventListener('click', () => searchApi('images'));
$('#apiVideoSearch').addEventListener('click', () => searchApi('videos'));
$('#apiImageQuery').addEventListener('keydown', event => { if (event.key === 'Enter') searchApi('images'); });
$('#apiVideoQuery').addEventListener('keydown', event => { if (event.key === 'Enter') searchApi('videos'); });
$('#customApiFetch').addEventListener('click', async () => {
  const url = $('#customApiUrl').value.trim();
  const resultElement = $('#customApiResult');
  if (!url) return;
  resultElement.textContent = 'Fetching...';
  try {
    const result = await api(`/api/admin/fetch/custom?url=${encodeURIComponent(url)}`, {
      headers: { 'x-custom-api-key': $('#customApiKey').value }
    });
    resultElement.textContent = JSON.stringify(result.data, null, 2);
  } catch (error) { resultElement.textContent = error.message; }
});

if (state.adminToken) {
  $('#adminLoginCard').hidden = true;
  $('#adminManager').hidden = false;
  loadContent().catch(error => {
    state.adminToken = null;
    sessionStorage.removeItem('codershubToken');
    $('#adminManager').hidden = true;
    $('#adminLoginCard').hidden = false;
    $('#loginError').textContent = error.message;
  });
}
