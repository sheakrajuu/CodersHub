const params = new URLSearchParams(window.location.search);
const journalId = params.get('id');

function escapeHtml(value = ''){
  return String(value).replace(/[&<>]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[character]));
}

async function loadJournal(){
  const response = await fetch('/api/content');
  const content = await response.json();
  const journal = (content.blogs || []).find(item => item.id === journalId);
  if (!journal){
    document.title = 'Journal not found | CodersHub';
    document.querySelector('#journalTitle').textContent = 'Journal not found';
    document.querySelector('#journalBody').textContent = 'This journal entry is no longer available.';
    return;
  }
  document.title = `${journal.title} | CodersHub`;
  document.querySelector('#journalTitle').textContent = journal.title;
  document.querySelector('#journalDate').textContent = new Date(journal.addedAt).toLocaleDateString();
  document.querySelector('#journalBody').textContent = journal.body || '';
  document.querySelector('#journalImages').innerHTML = (journal.images || []).map(url => `<img src="${escapeHtml(url)}" alt="" loading="lazy">`).join('');
}

loadJournal().catch(() => {
  document.querySelector('#journalTitle').textContent = 'Unable to load journal';
});
