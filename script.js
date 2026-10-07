// ON AIR — Australian television through the decades
// open index.html using live server
// no build tools or packages are needed

// 1. CURATED PROGRAMMES AND NFSA LINKS

// tvmaze IDs are verified originals; heartbreak high 3992 is not the 2022 remake
// editorial timeline: debut years describe the programme, not the date of the particular episode, still or publicity item held in the nfsa catalogue
// ids below were checked against /title/{id}. Searching by catalogue ID avoids unrelated cast biographies and remakes returned by broad keyword searches
const programmes = [
  { decade: 1950, title: 'Welcome to television', year: 1956, recordId: 1559625,
    summary: 'A new medium enters the Australian living room. Bruce Gyngell welcomes viewers to the opening night of regular television broadcasting.',
    archive: 'https://www.nfsa.gov.au/collection/item/good-evening-and-welcome-television-bruce-gyngell' },
  { decade: 1960, title: 'Skippy the Bush Kangaroo', year: 1968, recordId: 550575, tvmazeId: 9552,
    summary: 'A young boy and his kangaroo companion turn the Australian bush into a setting for adventure.',
    archive: 'https://www.nfsa.gov.au/collection/tagged/skippy' },
  { decade: 1970, title: 'Number 96', year: 1972, recordId: 38389, tvmazeId: 9496,
    summary: 'A groundbreaking Australian soap opera that challenged television conventions and brought controversial social issues into mainstream entertainment.',
    archive: 'https://www.nfsa.gov.au/collection/item/number-96-episode-35-im-practising-catholic',
    image: 'https://cdn.sanity.io/images/dhoneoxg/production/eecaa3efb01b1c6ce8d2c4412672c2dafe168629-768x527.jpg',
    imageAlt: 'A black-and-white scene from Number 96, Episode 35.',
    imageCredit: 'Number 96, Episode 35 · NFSA / Cash-Harmon Productions',
    imageSource: 'https://www.nfsa.gov.au/collection/item/number-96-episode-35-im-practising-catholic' },
  { decade: 1980, title: 'Neighbours', year: 1985, recordId: 1808923, tvmazeId: 5420,
    summary: 'Everyday lives and suburban relationships become an enduring Australian television story.' },
  { decade: 1990, title: 'Heartbreak High', year: 1994, recordId: 661507, tvmazeId: 3992,
    summary: 'School, identity and relationships take centre stage in this Australian teen drama.' },
  { decade: 2000, title: 'H2O: Just Add Water', year: 2006, recordId: 758307, tvmazeId: 2523,
    summary: 'Teenage friendship meets fantasy on the Australian coast, as three friends discover a secret that changes their lives.' },
  { decade: 2010, title: 'Bluey', year: 2018, recordId: 1701942, tvmazeId: 41821,
    summary: 'Everyday family life becomes a world of imaginative play for a blue heeler and her family.' },
  { decade: 2020, title: 'Fisk', year: 2021, recordId: 1644886, tvmazeId: 47584,
    summary: 'A small legal practice sets the scene for a distinctly Australian workplace comedy.' }
];

function archiveURL(programme) {
  // nsfa pro identifies Catalogue ID as mdd_version_id1
  // entity_name_or_id searches people/organisations, not catalogue numbers
  // always use this record id so "ok" matches the item loaded by the nsfa api
  const params = new URLSearchParams({
    'q[][fields]': 'mdd_version_id1',
    'q[][query]': String(programme.recordId),
    'q[][exact]': 'true'
  });
  return 'https://pro.nfsa.gov.au/titles?' + params;
}


// 2. API REQUESTS AND CACHING

// nsfa endpoints supplied in the unit materials. no key was required in testing
const API_URL = 'https://api.collection.nfsa.gov.au';
const MEDIA_URL = 'https://media.nfsacollection.net/';
const searchCache = new Map();
const detailCache = new Map();

async function requestJSON(path, signal) {
  const response = await fetch(API_URL + path, { signal });
  if (!response.ok) {
    if (response.status === 429) throw new Error('The archive is receiving too many requests. Please wait a minute and try again.');
    if (response.status === 404) throw new Error('This archive record is no longer available. Please try another decade.');
    throw new Error('The archive could not be loaded. Please try again.');
  }
  try { return await response.json(); }
  catch { throw new Error('The archive returned an unreadable response. Please try again.'); }
}

function validateSearch(data) {
  if (!data || !Array.isArray(data.results)) {
    throw new Error('The archive returned an unexpected search response.');
  }
  return data.results;
}

function findRecord(results, id) {
  return results.find(item => item && String(item.id) === String(id));
}

function previewURL(record) {
  const previews = Array.isArray(record?.preview) ? record.preview : [];
  for (const preview of previews) {
    if (typeof preview?.filePath !== 'string' || !preview.filePath.trim()) continue;
    try {
      const url = new URL(preview.filePath, MEDIA_URL);
      // do not insert arbitrary remote URLs received in an api response
      if (url.protocol === 'https:' && url.hostname === 'media.nfsacollection.net') return url.href;
    } catch { /*a malformed preview should not prevent the text from loading*/ }
  }
  return null;
}

async function loadProgramme(programme, signal) {
  const id = programme.recordId;
  let results = searchCache.get(id);
  if (!results) {
    // one curated result is needed per decade
    // explicit pagination limits the response; a gallery-style “more” control would not suit this timeline
    const params = new URLSearchParams({ query: String(id), page: '1', limit: '25' });
    const data = await requestJSON('/search?' + params, signal);
    results = validateSearch(data);
    // do not cache an empty result, so try again can make a fresh request
    if (results.length) searchCache.set(id, results);
  }
  const preview = findRecord(results, id);
  if (!preview) return null;
  let item = detailCache.get(id);
  if (!item) {
    item = await requestJSON('/title/' + encodeURIComponent(id), signal);
    if (!item || String(item.id) !== String(id) || typeof item.title !== 'string') {
      throw new Error('The archive returned an incomplete item record. Please try again.');
    }
    detailCache.set(id, item);
  }
  // search preview data and title details have different shapes
  // preserve both
  return { item, image: previewURL(item) || previewURL(preview) };
}

// tvmaze supplements the programme, never the nfsa archive object
const tvCache = new Map();
function safeTVURL(value, host = 'www.tvmaze.com') {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host ? url.href : null;
  } catch { return null; }
}

async function loadTVProgramme(programme, signal) {
  // the 1956 opening broadcast has no verified tvmaze series match
  if (!programme.tvmazeId) return null;
  if (tvCache.has(programme.tvmazeId)) return tvCache.get(programme.tvmazeId);
  const response = await fetch('https://api.tvmaze.com/shows/' + programme.tvmazeId, { signal });
  if (response.status === 404) return null;
  if (response.status === 429) throw new Error('TVmaze is busy. Wait a minute before trying again.');
  if (!response.ok) throw new Error('Additional programme information could not be loaded.');
  let show;
  try { show = await response.json(); }
  catch { throw new Error('TVmaze returned an unreadable response.'); }
  if (show?.id !== programme.tvmazeId || typeof show.name !== 'string' || show.name.toLowerCase() !== programme.title.toLowerCase()) {
    throw new Error('The supplementary programme record did not match this programme.');
  }
  tvCache.set(programme.tvmazeId, show);
  return show;
}


// 3. COMBINING NFSA AND TVMAZE INFORMATION

// field-level source selection is separate from rendering so it is easy to test
const list = value => Array.isArray(value) ? value : [];
const value = input => typeof input === 'string' ? input.trim() : '';
function credit(record, role) {
  return [...new Set(list(record?.credits).filter(person => role.test(person?.role || ''))
    .map(person => value(person.name)).filter(Boolean))].slice(0, 3).join(', ');
}
function programmeInfo(programme, record, show) {
  const nfsaOverview = value(record?.parentTitle?.seriesSummary) || value(record?.parentTitle?.seasonSummary);
  // an episode or poster description is not a series overview
  // prefer tvmaze's series summary when nfsa has only an individual archive-item description
  const overview = nfsaOverview || value(show?.summary) || value(record?.summary);
  const summarySource = nfsaOverview ? 'NFSA programme overview' : value(show?.summary) ? 'TVmaze programme overview' : value(record?.summary) ? 'NFSA archive-item description' : '';
  const nfsaGenres = list(record?.parentTitle?.genres).filter(g => typeof g === 'string');
  const nfsaNetwork = credit(record, /broadcaster|television network/i);
  const network = nfsaNetwork || value(show?.network?.name) || value(show?.webChannel?.name);
  const date = value(show?.premiered);
  // tvmaze currently reports 1995 for heartbreak high
  // keep the curated 1994 debut rather than presenting an inconsistent date as the australian debut
  const matchingDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number(date.slice(0, 4)) === programme.year;
  return {
    overview, summarySource,
    genres: nfsaGenres.length ? nfsaGenres : list(show?.genres).filter(g => typeof g === 'string'),
    genreSource: nfsaGenres.length ? 'NFSA' : 'TVmaze',
    creator: credit(record, /creator|production company/i),
    network, networkSource: nfsaNetwork ? 'NFSA' : 'TVmaze',
    premiere: matchingDate ? date : String(programme.year),
    premiereSource: matchingDate ? 'TVmaze' : 'curated',
    format: value(show?.type),
    language: list(record?.languages).filter(l => typeof l === 'string').join(', ') || value(show?.language)
  };
}


// 4. PAGE STATE, DISPLAY AND BUTTON CONTROLS


const get = id => document.getElementById(id);
// all views update on this html page
// the state object is the source of truth
const state = { index: 2, status: 'loading', record: null, image: null, show: null, nfsaStatus: 'loading', tvStatus: 'idle', nfsaError: '', tvError: '' };
let controller;
let requestNumber = 0;

function text(id, value) { get(id).textContent = value; }
function array(value) { return Array.isArray(value) ? value : []; }
function cleanText(value) {
  if (typeof value !== 'string') return '';
  // remote descriptions are treated as text, never injected into innerhtml
  return new DOMParser().parseFromString(value, 'text/html').body.textContent.trim();
}
function recordDate(record) {
  const date = array(record?.productionDates)[0];
  if (!date) return 'Not recorded';
  return [date.type, date.fromYear, date.toYear && date.toYear !== date.fromYear ? '– ' + date.toYear : ''].filter(Boolean).join(' ');
}

function renderImage(programme) {
  const picture = get('picture');
  picture.querySelector('img')?.remove();
  get('image-fallback').hidden = false;
  text('image-year', programme.decade + 's');
  text('image-message', state.status === 'loading' ? 'Loading programme image…' : 'No programme image available.');
  get('image-credit').replaceChildren();
  // try sources in order
  // a broken nfsa image can still fall back to tvmaze
  const candidates = [
    { url: state.image, alt: 'NFSA archive preview for ' + programme.title, label: 'Image: NFSA collection', link: archiveURL(programme) },
    { url: programme.image, alt: programme.imageAlt, label: programme.imageCredit, link: programme.imageSource },
    { url: safeTVURL(state.show?.image?.original || state.show?.image?.medium, 'static.tvmaze.com'),
      alt: programme.title + ' programme artwork', label: 'Programme artwork: TVmaze',
      link: safeTVURL(state.show?.url), poster: true }
  ].filter(candidate => candidate.url);
  const imageRequest = requestNumber;
  function tryImage(index) {
    if (imageRequest !== requestNumber || !candidates[index]) return;
    const candidate = candidates[index];
    const img = document.createElement('img');
    img.alt = candidate.alt;
    if (candidate.poster) img.className = 'programme-poster';
    img.hidden = true;
    img.addEventListener('load', () => {
      if (!img.isConnected) return;
      get('image-fallback').hidden = true; img.hidden = false;
      const link = document.createElement('a');
      link.href = candidate.link || 'https://www.tvmaze.com/'; link.textContent = candidate.label;
      get('image-credit').replaceChildren(link);
    });
    img.addEventListener('error', () => {
      if (!img.isConnected) return;
      img.remove(); text('image-message', 'Programme image unavailable.');
      tryImage(index + 1);
    });
    picture.append(img); img.src = candidate.url;
  }
  tryImage(0);
}

function render() {
  const programme = programmes[state.index];
  const record = state.record;
  const info = programmeInfo(programme, record, state.show);
  text('programme-title', programme.title);
  text('year', programme.year);
  text('curated-summary', programme.summary);
  document.title = programme.title + ' · ' + programme.decade + 's | ON AIR';
  document.querySelectorAll('#decades button').forEach((button, index) => {
    button.setAttribute('aria-current', String(index === state.index));
  });
  get('programme').setAttribute('aria-busy', String(state.status === 'loading'));
  const messages = [];
  if (state.nfsaStatus === 'loading') messages.push('Loading NFSA archive information…');
  if (state.tvStatus === 'loading') messages.push('Loading additional programme information…');
  if (state.nfsaStatus === 'error') messages.push('NFSA: ' + state.nfsaError);
  if (state.tvStatus === 'error') messages.push('TVmaze: ' + state.tvError);
  if (state.nfsaStatus === 'empty') messages.push('No matching NFSA archive record was found.');
  if (state.tvStatus === 'empty') messages.push('No supplementary TVmaze record was found.');
  if (!messages.length) messages.push(record ? 'From the NFSA collection' : 'Programme information from TVmaze');
  text('status', messages.join(' '));
  get('retry').hidden = !['error', 'empty'].includes(state.nfsaStatus) && !['error', 'empty'].includes(state.tvStatus);
  renderImage(programme);
  const genres = info.genres;
  get('tags').setAttribute('aria-label', 'Programme genres from ' + info.genreSource);
  get('tags').replaceChildren();
  genres.slice(0, 4).forEach(genre => {
    const li = document.createElement('li'); li.textContent = genre; get('tags').append(li);
  });
  const description = cleanText(info.overview);
  text('description', description || (state.status === 'loading' ? 'Loading programme information…' : 'A description is not available from either source. Press OK to explore the NFSA.'));
  text('description-source', info.summarySource);
  const rows = [
    ['Creator / production', info.creator ? info.creator + ' (NFSA)' : 'Not recorded'],
    ['Broadcaster', info.network ? info.network + ' (' + info.networkSource + ')' : 'Not recorded'],
    ['Programme debut', info.premiere + ' (' + info.premiereSource + ')'],
    ['Programme format', info.format ? info.format + ' (TVmaze)' : 'Not recorded'],
    ['Language', info.language || 'Not recorded'],
    ['Archive format', array(record?.forms).join(', ') || record?.subMedium || 'Not recorded']
  ];
  const tvLink = get('tvmaze-source');
  const tvURL = safeTVURL(state.show?.url);
  tvLink.hidden = !tvURL;
  if (tvURL) tvLink.href = tvURL;
  get('metadata').replaceChildren();
  rows.forEach(([label, value]) => {
    const row = document.createElement('div'); const term = document.createElement('dt'); const detail = document.createElement('dd');
    term.textContent = label; detail.textContent = value; row.append(term, detail); get('metadata').append(row);
  });
  get('record-details').hidden = !record;
  text('record-title', record ? record.title + ' · Catalogue ID ' + record.id : '');
  text('record-summary', cleanText(record?.summary) || 'No item description supplied.');
  text('record-date', 'Archive item date: ' + recordDate(record));
  get('archive-link').href = archiveURL(programme);
  get('archive-link').setAttribute('aria-label', 'OK — View more about ' + programme.title + ' on the NFSA website (opens a new tab)');
  get('previous').disabled = state.index === 0;
  get('next').disabled = state.index === programmes.length - 1;
  text('previous-label', state.index === 0 ? 'Back' : programmes[state.index - 1].decade);
  text('next-label', state.index === programmes.length - 1 ? 'Next' : programmes[state.index + 1].decade);
  get('previous').setAttribute('aria-label', state.index === 0 ? 'No earlier decade' : 'Previous decade: ' + programmes[state.index - 1].decade + 's');
  get('next').setAttribute('aria-label', state.index === programmes.length - 1 ? 'No later decade' : 'Next decade: ' + programmes[state.index + 1].decade + 's');
}

async function selectProgramme(index, updateHistory = true) {
  controller?.abort();
  controller = new AbortController();
  const activeController = controller;
  const currentRequest = ++requestNumber;
  state.index = index; state.record = null; state.image = null; state.show = null;
  state.nfsaError = ''; state.tvError = ''; state.status = 'loading';
  state.nfsaStatus = 'loading'; state.tvStatus = programmes[index].tvmazeId ? 'loading' : 'idle';
  get('record-details').open = false;
  if (updateHistory) history.pushState(null, '', '#decade-' + programmes[index].decade);
  render();
  // keep the selected marker visible on the horizontally scrolling mobile timeline
  const button = get('decades').children[index];
  get('timeline').scrollLeft = Math.max(0, button.offsetLeft - get('timeline').clientWidth / 2 + button.offsetWidth / 2);
  const timeout = setTimeout(() => activeController.abort('timeout'), 20000);
  // each service updates independently
  // one failed API never hides the other's data
  async function loadSource(source, loader) {
    try {
      const data = await loader(programmes[index], activeController.signal);
      if (currentRequest !== requestNumber) return;
      if (source === 'nfsa') { state.record = data?.item || null; state.image = data?.image || null; }
      else state.show = data;
      state[source + 'Status'] = data ? 'success' : 'empty';
    } catch (error) {
      if (currentRequest !== requestNumber) return;
      state[source + 'Status'] = 'error';
      state[source + 'Error'] = activeController.signal.aborted ? 'The request timed out. Please try again.'
        : error instanceof TypeError ? 'Unable to connect. Check your connection and try again.' : error.message;
    } finally {
      if (currentRequest === requestNumber) {
        state.status = state.nfsaStatus === 'loading' || state.tvStatus === 'loading' ? 'loading' : 'ready';
        render();
      }
    }
  }
  await Promise.allSettled([
    loadSource('nfsa', loadProgramme),
    programmes[index].tvmazeId ? loadSource('tv', loadTVProgramme) : Promise.resolve()
  ]);
  clearTimeout(timeout);

}

programmes.forEach((programme, index) => {
  const button = document.createElement('button');
  button.textContent = programme.decade;
  button.setAttribute('aria-label', programme.decade + 's: ' + programme.title);
  button.addEventListener('click', () => selectProgramme(index));
  get('decades').append(button);
});
get('previous').addEventListener('click', () => selectProgramme(Math.max(0, state.index - 1)));
get('next').addEventListener('click', () => selectProgramme(Math.min(programmes.length - 1, state.index + 1)));
get('retry').addEventListener('click', () => selectProgramme(state.index, false));

const dialog = get('about-dialog');
get('about-button').addEventListener('click', () => dialog.showModal());
get('close-about').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});
dialog.addEventListener('close', () => get('about-button').focus());
function readLocation() {
  const index = programmes.findIndex(programme => '#decade-' + programme.decade === location.hash);
  selectProgramme(index >= 0 ? index : 2, false);
}
window.addEventListener('popstate', readLocation);
readLocation();
