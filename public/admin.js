const state = {
  content: { pictures: [], videos: [], blogs: [], links: [], mangas: [] },
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
  $('#adminPictureList').innerHTML = content.pictures.map(item => rowHtml(item.id, item.caption || item.url, 'pictures')).join('');
  $('#adminBlogList').innerHTML = content.blogs.map(item => rowHtml(item.id, item.title, 'blogs')).join('');
  $('#adminLinkList').innerHTML = (content.links || []).map(item => rowHtml(item.id, item.title || item.url, 'links')).join('');
  $$('.admin-row button').forEach(button => button.addEventListener('click', removeItem));
}

function rowHtml(id, label, type){
  return `<div class="admin-row"><span class="rt">${escapeHtml(label)}</span><button data-id="${id}" data-type="${type}" type="button">Delete</button></div>`;
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
