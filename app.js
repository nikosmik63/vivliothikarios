/* Βιβλιοθηκάριος — web εφαρμογή. Όλη η αναζήτηση γίνεται στη συσκευή του χρήστη, απευθείας στις ανοιχτές
   βιβλιοθήκες (Gutenberg, Internet Archive, Open Library, Google Books, Europeana, OpenAlex, Crossref, …).
   Δεν υπάρχει διακομιστής, λογαριασμός ή παρακολούθηση· οι λίστες μένουν στον browser. */
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const plain = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const LANGS = {el: 'Ελληνικά', en: 'Αγγλικά', fr: 'Γαλλικά', de: 'Γερμανικά', it: 'Ιταλικά', es: 'Ισπανικά', tr: 'Τουρκικά',
  ru: 'Ρωσικά', la: 'Λατινικά', pt: 'Πορτογαλικά', nl: 'Ολλανδικά'};
const SEARCH_LANGS = ['el', 'en', 'fr', 'de', 'it', 'es'];
const ISO3 = {eng: 'en', gre: 'el', ell: 'el', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it', spa: 'es', tur: 'tr', rus: 'ru',
  lat: 'la', por: 'pt', dut: 'nl', nld: 'nl', grc: 'el', english: 'en', greek: 'el', french: 'fr', german: 'de', italian: 'it', spanish: 'es'};
const normLang = l => { l = plain(Array.isArray(l) ? l[0] : l).trim(); return LANGS[l] ? l : ISO3[l] || (l.length === 2 ? l : ''); };
const MAILTO = 'vivliothikarios@example.org';
const state = {mode: 'books', results: [], press: [], links: [], view: 'free', cat: '', lang: '', shown: 30};

// ───────────── δίκτυο ─────────────
async function getJSON(url, timeout = 20000){
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, {signal: ctl.signal, headers: {Accept: 'application/json'}});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function getText(url, timeout = 20000){
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try { const r = await fetch(url, {signal: ctl.signal}); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
  finally { clearTimeout(t); }
}
const qs = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
const wd = p => getJSON('https://www.wikidata.org/w/api.php?' + qs({...p, format: 'json', origin: '*'}), 15000);

// ───────────── κατανόηση ερώτησης ─────────────
const QWORDS = new Set(`πως ποιος ποια ποιο ποιοι ποιες ποιον ποιας ποιου ποιων τι γιατι ποτε που ποσο ποσα ποσοι μηπως αραγε
υπαρχει υπαρχουν υπηρχε υπηρχαν βρες βρεις ψαξε θελω δειξε πες ξερεις μπορεις βιβλια βιβλιο βιβλιων κειμενα πηγες πηγη
στοιχεια πληροφοριες αρθρα αρθρο εφημεριδες περιοδικα what how why when where who which whose is are was were do does did can
could find show tell me books book about information articles papers`.split(/\s+/));
const STOPW = new Set(`και η ο το οι τα του της των τον την τη τους τις στο στη στην στον στα στους στις σε με για απο ως κατα μετα
προς χωρις μεχρι αν ενω οτι πιο πολυ λιγο ενας μια ενα αυτο αυτη αυτος αυτα εκει εδω ειναι ηταν εχει ειχε ειχαν θα να δεν μη μην
σαν ομως επισης ακομα ακομη μονο ολα ολοι καθε the a an of and or in on at to for with from by into as be been that this these
those it its their there than then also only very more most such`.split(/\s+/));
const CENT = {πρωτ: 1, δευτερ: 2, τριτ: 3, τεταρτ: 4, πεμπτ: 5, εκτ: 6, εβδομ: 7, ογδο: 8, ενατ: 9, δεκατ: 10};
const isSentence = t => /[?;]\s*$/.test(t.trim()) || t.trim().split(/\s+/).length >= 5 || QWORDS.has(plain(t.trim().split(/\s+/)[0]));
function parsePeriod(text){
  const p = plain(text);
  let y = [...text.matchAll(/(?<!\d)(1[0-9]\d\d|20[0-2]\d)(?!\d)/g)].map(m => +m[1]);
  if (y.length >= 2) return [Math.min(...y), Math.max(...y)];
  if (y.length === 1) return /δεκαετ|decade/.test(p) || new RegExp(y[0] + 's\\b').test(text) ? [y[0] - y[0] % 10, y[0] - y[0] % 10 + 9] : [y[0], y[0]];
  let n = null, m = p.match(/(\d{1,2})\s*(?:ος|ο|ου|th|st|nd|rd|e)?\s*(?:αι\b|αι\.|αιων|century|siecle)/);
  if (m) n = +m[1];
  if (!n){
    const ords = Object.keys(CENT).filter(k => k !== 'δεκατ').join('|');
    m = p.match(new RegExp(`(δεκατ|εικοστ)\\S*\\s+(${ords})\\S*\\s+αιων`));
    if (m) n = (m[1] === 'δεκατ' ? 10 : 20) + CENT[m[2]];
    else { m = p.match(new RegExp(`(${Object.keys(CENT).join('|')}|εικοστ)\\S*\\s+αιων`)); if (m) n = m[1] === 'εικοστ' ? 20 : CENT[m[1]]; }
  }
  if (!n || n > 21) return [null, null];
  let a = (n - 1) * 100, b = a + 99;
  if (/αρχες|αρχη|early/.test(p)) b = a + 33; else if (/τελη|τελος|late/.test(p)) a += 66; else if (/μεσα|mid/.test(p)) { b = a + 66; a += 33; }
  return [a, b];
}
function contentTokens(text){
  return (text.match(/[\p{L}\p{N}'’-]+/gu) || []).filter(raw => {
    const w = plain(raw);
    return !(QWORDS.has(w) || STOPW.has(w) || w.length < 3 || /^\d+(ος|ο|ου|ης|η|th|s)?$/.test(w) || /^(αιων|century|δεκαετ|αρχες|τελη|μεσα)/.test(w));
  });
}
const BAD_DESC = /disambiguation|αποσαφην|wikimedia|family name|επωνυμο|given name|album|song|single by|film|ταινια|band|συγκροτημα|team|club|ομαδα|television|series|video game/;
async function findEntity(phrase, lang0){
  for (const q of [phrase, !phrase.includes(' ') && phrase.length > 6 ? phrase.slice(0, -2) : null].filter(Boolean)){
    let hits = [];
    try { hits = (await wd({action: 'wbsearchentities', search: q, language: lang0, uselang: lang0, type: 'item', limit: 5})).search || []; } catch (e) { return null; }
    hits = hits.filter(h => !BAD_DESC.test(plain(h.description)));
    const pw = plain(phrase).split(/\s+/).map(w => w.slice(0, Math.max(4, w.length - 3)));
    const ok = hits.find(h => { const lw = plain(h.label || h.match?.text).split(/\s+/);
      return pw.every(s => lw.some(l => l.startsWith(s) || s.startsWith(l.slice(0, Math.max(4, l.length - 3))))); });
    if (ok) return ok.id;
  }
  return null;
}
/* Φράσεις που δεν είναι όνομα έννοιας (π.χ. «ναυάγιο Περσεύς»): η Wikipedia καταλαβαίνει τα συμφραζόμενα */
async function wikipediaEntity(text, lang0){
  const words = plain(text).match(/[\p{L}\p{N}]{3,}/gu)?.map(w => w.slice(0, Math.max(4, w.length - 2))) || [];
  for (const lang of [...new Set([lang0, 'en'])]){
    try {
      const api = `https://${lang}.wikipedia.org/w/api.php?`;
      const titles = ((await getJSON(api + qs({action: 'query', list: 'search', srsearch: text, srlimit: 3, format: 'json', origin: '*'}), 15000)).query?.search || []).map(h => h.title);
      if (!titles.length) continue;
      const pp = (await getJSON(api + qs({action: 'query', prop: 'pageprops', ppprop: 'wikibase_item', redirects: 1, titles: titles.join('|'), format: 'json', origin: '*'}), 15000)).query || {};
      const redir = Object.fromEntries((pp.redirects || []).map(r => [r.from, r.to]));
      const byT = Object.fromEntries(Object.values(pp.pages || {}).map(p => [p.title, p.pageprops?.wikibase_item]));
      const pick = titles.find(t => byT[redir[t] || t] && words.some(w => plain(t).includes(w)));
      if (pick) return byT[redir[pick] || pick];
      if (lang === lang0 && byT[redir[titles[0]] || titles[0]]) return byT[redir[titles[0]] || titles[0]];
    } catch (e) {}
  }
  return null;
}
const cleanLabel = v => String(v || '').replace(/\s*\([^)]*\)\s*$/, '').trim() || v;
async function labelsOf(ids, langs = [...SEARCH_LANGS, 'tr', 'ru']){
  if (!ids.length) return {};
  try {
    const ents = (await wd({action: 'wbgetentities', ids: ids.join('|'), props: 'labels|aliases|claims', languages: langs.join('|')})).entities || {};
    const out = {};
    for (const [q, e] of Object.entries(ents)){
      out[q] = {labels: Object.fromEntries(Object.entries(e.labels || {}).map(([l, v]) => [l, cleanLabel(v.value)])),
        aliases: Object.values(e.aliases || {}).flat().map(a => a.value).slice(0, 12),
        human: (e.claims?.P31 || []).some(c => c.mainsnak?.datavalue?.value?.id === 'Q5')};
    }
    return out;
  } catch (e) { return {}; }
}
/* Από θέμα ή πρόταση → όροι ανά γλώσσα, έννοιες, περίοδος */
async function understand(text){
  const lang0 = /[Ͱ-Ͽἀ-῿]/.test(text) ? 'el' : 'en';
  const [y1, y2] = parsePeriod(text);
  if (!isSentence(text)){
    const topic = text.replace(/(?<!\d)(1[0-9]\d\d|20[0-2]\d)(?!\d)(\s*[-–]\s*(1[0-9]\d\d|20[0-2]\d))?/g, '').trim() || text;
    let q = await findEntity(topic, lang0);
    if (topic.trim().split(/\s+/).length > 1){ const w = await wikipediaEntity(topic, lang0); if (w) q = w; }
    const L = q ? await labelsOf([q]) : {};
    const labels = L[q]?.labels || {};
    const byLang = {[lang0]: topic};
    for (const l of SEARCH_LANGS) if (labels[l] && !byLang[l]) byLang[l] = labels[l];
    return {sentence: false, topic, byLang, concepts: q ? [labels.el || labels.en || topic] : [], keywords: [], y1, y2};
  }
  const toks = contentTokens(text);
  const cands = [...toks.slice(0, -1).map((t, i) => t + ' ' + toks[i + 1]), ...toks].slice(0, 12);
  const found = await Promise.all(cands.map(c => findEntity(c, lang0)));
  const used = new Set(), qids = [], from = {};
  cands.forEach((c, i) => { const ws = c.split(' '); if (!found[i] || ws.some(w => used.has(w))) return; qids.push(found[i]); from[found[i]] = c; ws.forEach(w => used.add(w)); });
  if (!qids.length){ const w = await wikipediaEntity(toks.join(' '), lang0); if (w){ qids.push(w); from[w] = toks.join(' '); toks.forEach(t => used.add(t)); } }
  const L = await labelsOf([...new Set(qids)]);
  const concepts = [...new Set(qids)].map(q => ({q, from: from[q], labels: L[q]?.labels || {}}));
  const rest = toks.filter(w => !used.has(w));
  const byLang = {};
  for (const l of SEARCH_LANGS){
    if (concepts.some(c => c.labels[l])) byLang[l] = concepts.map(c => c.labels[l] || c.labels.en || c.from).join(' ');
  }
  const topic = concepts.map(c => c.labels[lang0] || c.from).join(' ') || rest.join(' ') || toks.join(' ');
  byLang[lang0] = topic;
  return {sentence: true, topic, byLang, concepts: concepts.map(c => c.labels.el || c.labels.en || c.from), keywords: rest, y1, y2};
}
async function focusVariants(focus){
  if (!focus) return [];
  const lang0 = /[Ͱ-Ͽ]/.test(focus) ? 'el' : 'en';
  const q = await findEntity(focus, lang0);
  const L = q ? (await labelsOf([q]))[q] : null;
  let out = [focus, ...Object.values(L?.labels || {}), ...(L?.aliases || [])];
  if (L?.human || focus.trim().split(/\s+/).length > 1)
    out.forEach(n => { const p = (n.match(/[\p{L}'’-]+/gu) || []).filter(x => x.length >= 5); if (p.length >= 2) out.push(p.at(-1)); });
  return [...new Map(out.map(x => [plain(x).trim(), x])).values()].filter(Boolean).slice(0, 30);
}

// ───────────── σχετικότητα ─────────────
const stem = w => { w = plain(w); return w.length > 5 ? w.slice(0, Math.max(4, w.length - 2)) : w; };
function matcher(terms){
  const pats = [...new Set((terms || []).filter(Boolean))].map(t => {
    const ws = plain(t).match(/[\p{L}\p{N}]+/gu)?.filter(w => w.length > 1 && !STOPW.has(w)) || [];
    return {t, re: ws.map(w => new RegExp('(?<![\\p{L}\\p{N}])' + stem(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\p{L}\\p{N}]{0,5}(?![\\p{L}\\p{N}])', 'u'))};
  }).filter(p => p.re.length);
  return text => { const n = plain(text); const hit = pats.find(p => p.re.every(r => r.test(n))); return hit ? hit.t : null; };
}
function score(r, tm, fm){
  const title = [r.title, r.publication].join(' '), subj = (r.subjects || []).join(' | '), other = [r.abstract, r.note, r.venue, r.publisher].join(' ');
  let s = 0; const why = [];
  let t = tm(title);
  if (t){ s += 55; why.push(`θέμα στον τίτλο («${t}»)`); }
  else if ((t = tm(subj))){ s += (r.subjects || []).length <= 12 ? 40 : 25; why.push(`θέμα στις θεματικές επικεφαλίδες («${t}»)`); }
  else if ((t = tm(other))){ s += 25; why.push(`θέμα στην περιγραφή («${t}»)`); }
  if ((r.sources || []).length > 1) s += Math.min(10, 5 * (r.sources.length - 1));
  if (fm){
    let f = fm(title);
    if (f){ s += 40; why.push(`εστίαση στον τίτλο («${f}»)`); }
    else if ((f = fm(subj) || fm(other))){ s += 28; why.push(`εστίαση στην περιγραφή («${f}»)`); }
    else { s = Math.floor(s * .35); why.push('δεν αναφέρει την εστίαση'); }
  }
  s = Math.max(0, Math.min(100, s));
  r.relevance = s; r.why = why;
  r.level = s >= 50 ? 'high' : s >= 20 ? 'medium' : s >= 1 ? 'low' : 'none';
  return s;
}
const MIN = {all: 0, relevant: 20, high: 50};

// ───────────── κατηγορίες ─────────────
const CATS = {primary: 'Πρωτογενείς πηγές', history: 'Ιστορία', fiction: 'Λογοτεχνία', science: 'Επιστήμη & οδηγοί', academic: 'Ακαδημαϊκά',
  children: 'Παιδικά', religion: 'Θρησκεία & φιλοσοφία', other: 'Γενικά',
  article: 'Επιστημονικά άρθρα', thesis: 'Διατριβές', chapter: 'Κεφάλαια & πρακτικά', review: 'Ανασκοπήσεις', preprint: 'Προδημοσιεύσεις', book: 'Επιστημονικά βιβλία'};
const CAT_RULES = [['children', /juvenile|children|παιδικ|kinderbuch|jeunesse/], ['fiction', /fiction|novel|romance|short stories|poetry|poems|drama|roman\b|μυθιστορ|ποιηση|διηγημ/],
  ['primary', /sources|correspondence|diaries|personal narratives|letters|documents|speeches|memoirs|πηγες|απομνημονευ|επιστολ|ημερολογι/],
  ['religion', /religion|theology|church|bible|philosophy|θρησκ|θεολογ|εκκλησ|φιλοσοφ/], ['history', /history|historia|histoire|geschichte|ιστορ|antiquities|archaeolog|αρχαιολογ/],
  ['science', /science|agricultur|bees|medicine|handbook|manual|technology|γεωργ|επιστημ|εγχειριδ|τεχνολογ/], ['academic', /thesis|dissertation|journal|proceedings|διατριβ/]];
const classify = r => { const t = plain([...(r.subjects || []), r.title].join(' ')); return (CAT_RULES.find(([, re]) => re.test(t)) || ['other'])[0]; };

// ───────────── πηγές βιβλίων ─────────────
const KEEP = n => n;
async function gutendex(term, lang){
  const d = await getJSON('https://gutendex.com/books/?' + qs({search: term, languages: lang === 'el' ? '' : lang}), 20000);
  return (d.results || []).slice(0, 25).map(b => {
    const f = b.formats || {};
    const epub = Object.keys(f).find(k => k.startsWith('application/epub'));
    const txt = Object.keys(f).find(k => k.startsWith('text/plain'));
    const u = epub ? f[epub] : txt ? f[txt] : '';
    return {id: 'pg-' + b.id, source: 'Project Gutenberg', title: b.title, author: (b.authors || []).map(a => a.name).join('; '),
      year: '', lang: normLang(b.languages), subjects: [...(b.subjects || []), ...(b.bookshelves || [])], kind: 'free',
      ext: epub ? 'epub' : 'txt', url: u, page: `https://www.gutenberg.org/ebooks/${b.id}`};
  });
}
async function archive(term, lang){
  const l3 = Object.entries(ISO3).find(([k, v]) => v === lang && k.length === 3)?.[0];
  const q = `(title:(${term}) OR subject:(${term})) AND mediatype:texts AND NOT access-restricted-item:true` + (l3 ? ` AND language:(${l3} OR ${LANGS[lang] ? ({el: 'Greek', en: 'English', fr: 'French', de: 'German', it: 'Italian', es: 'Spanish'})[lang] || l3 : l3})` : '');
  const d = await getJSON('https://archive.org/advancedsearch.php?' + new URLSearchParams([['q', q], ...['identifier', 'title', 'creator', 'year', 'language', 'subject', 'description'].map(f => ['fl[]', f]), ['rows', '30'], ['sort[]', 'downloads desc'], ['output', 'json']]), 25000);
  return (d.response?.docs || []).map(x => ({id: 'ia-' + x.identifier, source: 'Internet Archive', title: [].concat(x.title)[0] || '',
    author: [].concat(x.creator || []).join('; '), year: String(x.year || '').slice(0, 4), lang: normLang(x.language),
    subjects: [].concat(x.subject || []).slice(0, 20), abstract: String([].concat(x.description || [])[0] || '').replace(/<[^>]+>/g, ' ').slice(0, 500),
    kind: 'free', ext: 'pdf', ia: x.identifier, page: `https://archive.org/details/${x.identifier}`}));
}
async function openlibrary(term, lang){
  const l3 = Object.entries(ISO3).find(([k, v]) => v === lang && k.length === 3)?.[0];
  const d = await getJSON('https://openlibrary.org/search.json?' + qs({q: term, language: l3, limit: 40,
    fields: 'key,title,author_name,first_publish_year,language,ia,ebook_access,subject,edition_count'}), 25000);
  return (d.docs || []).map(x => {
    const pub = x.ebook_access === 'public' && x.ia?.length, borrow = ['borrowable', 'printdisabled'].includes(x.ebook_access);
    return {id: 'ol-' + x.key.split('/').pop(), source: 'Open Library', title: x.title, author: (x.author_name || []).join('; '),
      year: String(x.first_publish_year || ''), lang: normLang((x.language || [])[0]), subjects: (x.subject || []).slice(0, 20),
      kind: pub ? 'free' : 'catalog', ext: pub ? 'pdf' : '', ia: pub ? x.ia[0] : null, page: 'https://openlibrary.org' + x.key,
      note: borrow ? 'δανεισμός e-book (δωρεάν λογαριασμός)' : x.edition_count > 1 ? `${x.edition_count} εκδόσεις` : ''};
  });
}
const GOOGLE = {until: 0};
async function google(term, lang){
  if (Date.now() < GOOGLE.until) return [];
  let d;
  try { d = await getJSON('https://www.googleapis.com/books/v1/volumes?' + qs({q: term, maxResults: 30, langRestrict: lang, printType: 'books'}), 20000); }
  catch (e) { if (/429/.test(e.message)) GOOGLE.until = Date.now() + 15 * 60e3; throw e; }
  return (d.items || []).map(it => {
    const v = it.volumeInfo || {}, a = it.accessInfo || {}, s = it.saleInfo || {};
    const dl = ['epub', 'pdf'].find(f => a[f]?.downloadLink && a.viewability === 'ALL_PAGES');
    const price = s.retailPrice ? `${s.retailPrice.amount} ${s.retailPrice.currencyCode}` : '';
    return {id: 'gb-' + it.id, source: 'Google Books', title: v.title + (v.subtitle ? ': ' + v.subtitle : ''), author: (v.authors || []).join('; '),
      year: (v.publishedDate || '').slice(0, 4), lang: normLang(v.language), subjects: v.categories || [], abstract: (v.description || '').slice(0, 500),
      publisher: v.publisher, kind: dl ? 'free' : s.saleability === 'FOR_SALE' ? 'paid' : 'catalog', ext: dl || '', url: dl ? a[dl].downloadLink : '',
      price, buy: s.buyLink, page: v.infoLink || v.canonicalVolumeLink};
  });
}
async function europeana(term, lang, extra = []){
  const d = await getJSON('https://api.europeana.eu/record/v2/search.json?' + new URLSearchParams([['wskey', 'api2demo'], ['query', term], ['rows', '40'], ['profile', 'standard'], ...extra]), 25000);
  return (d.items || []).map(it => {
    const f = k => [].concat(it[k] || [])[0] || '';
    const rights = f('rights'), open = /publicdomain|\/zero\/|\/by\/|\/by-sa\/|NoC/.test(rights), prov = f('dataProvider');
    const au = f('dcCreator');
    return {id: 'eu-' + String(it.id).replace(/\W+/g, '').slice(-50), source: 'Europeana', title: f('title'), author: au && !au.startsWith('http') ? au : prov,
      year: String(f('year')), lang: normLang(f('language')), subjects: [], kind: open ? 'free' : 'catalog', readOnly: open, read: f('edmIsShownAt'),
      page: f('edmIsShownAt') || it.guid, note: prov ? 'από ' + prov : ''};
  });
}

// ───────────── τύπος της εποχής ─────────────
async function pressArchive(term, y1, y2, news = true){
  let q = `(title:(${term}) OR description:(${term}) OR subject:(${term})) AND mediatype:texts AND ` + (news ? '(collection:newspapers OR collection:pub_newspapers)'
    : '(collection:periodicals OR collection:serials OR collection:magazine_rack OR collection:pulpmagazinearchive OR collection:sim_microfilm)');
  if (y1 || y2) q += ` AND date:[${y1 || 1500}-01-01 TO ${y2 || 2030}-12-31]`;
  const d = await getJSON('https://archive.org/advancedsearch.php?' + new URLSearchParams([['q', q], ...['identifier', 'title', 'date', 'language', 'publisher'].map(f => ['fl[]', f]), ['rows', '60'], ['sort[]', 'date asc'], ['output', 'json']]), 25000);
  const per = {};
  return (d.response?.docs || []).filter(x => { const k = plain([].concat(x.title)[0]).replace(/[\d\W_]+/g, ' ').trim().slice(0, 40); per[k] = (per[k] || 0) + 1; return per[k] <= 4; })
    .map(x => ({id: 'iap-' + x.identifier, source: 'Internet Archive', publication: [].concat(x.title)[0], date: String(x.date || '').slice(0, 10),
      lang: normLang(x.language), page: `https://archive.org/details/${x.identifier}`, press: true}));
}
async function pressEuropeana(term, y1, y2){
  const extra = [['theme', 'newspaper']]; if (y1 || y2) extra.push(['qf', `YEAR:[${y1 || 1500} TO ${y2 || 2030}]`]);
  const d = await getJSON('https://api.europeana.eu/record/v2/search.json?' + new URLSearchParams([['wskey', 'api2demo'], ['query', term], ['rows', '50'], ['profile', 'standard'], ...extra]), 25000);
  return (d.items || []).map(it => { const t = [].concat(it.title || [])[0] || ''; const m = t.match(/\d{4}-\d\d-\d\d/);
    return {id: 'eun-' + String(it.id).replace(/\W+/g, '').slice(-50), source: 'Europeana', publication: t.split(/\s+[-–]\s+\d{4}/)[0], date: m ? m[0] : String([].concat(it.year || [])[0] || ''),
      lang: normLang([].concat(it.language || [])[0]), page: [].concat(it.edmIsShownAt || [])[0] || it.guid, place: [].concat(it.dataProvider || [])[0], press: true}; });
}
async function pressGallica(term, y1, y2, news = true){
  let query = `gallica all "${term}" and dc.type all "fascicule"` + (news ? '' : ' and (dc.title all "revue" or dc.title all "bulletin" or dc.title all "journal" or dc.title all "annales")');
  if (y1) query += ` and gallicapublication_date>="${y1}"`; if (y2) query += ` and gallicapublication_date<="${y2}"`;
  const xml = await getText('https://gallica.bnf.fr/SRU?' + qs({version: '1.2', operation: 'searchRetrieve', query, maximumRecords: 40}), 25000);
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return [...doc.getElementsByTagNameNS('*', 'recordData')].map(rd => {
    const g = t => [...rd.getElementsByTagNameNS('*', t)].map(e => e.textContent);
    const link = g('identifier').find(i => i.includes('gallica.bnf.fr/ark:')) || '';
    const ark = (link.match(/ark:\/\d+\/([^/?#]+)/) || [])[1] || link;
    return {id: 'gal-' + ark, source: 'Gallica', publication: g('title')[0] || '', date: g('date')[0] || '', lang: 'fr', page: link, press: true};
  }).filter(x => x.page);
}
const PRESS_LINKS = (t, en) => [['Εθνική Βιβλιοθήκη της Ελλάδος', 'https://www.nlg.gr/'], ['Ανέμη — Παν. Κρήτης', 'https://anemi.lib.uoc.gr/'],
  ['Βιβλιοθήκη της Βουλής', 'https://library.parliament.gr/'], ['Chronicling America (ΗΠΑ)', `https://www.loc.gov/collections/chronicling-america/?q=${encodeURIComponent(en)}`],
  ['Delpher (Ολλανδία)', `https://www.delpher.nl/nl/kranten/results?query=${encodeURIComponent(en)}`], ['ANNO (Αυστρία)', `https://anno.onb.ac.at/anno-suche#searchMode=simple&query=${encodeURIComponent(en)}`],
  ['Trove (Αυστραλία)', `https://trove.nla.gov.au/search/category/newspapers?keyword=${encodeURIComponent(en)}`], ['Papers Past (Ν. Ζηλανδία)', `https://paperspast.natlib.govt.nz/newspapers?query=${encodeURIComponent(en)}`]];

// ───────────── επιστημονικές δημοσιεύσεις ─────────────
const TYPE_MAP = {article: 'article', 'journal-article': 'article', journalarticle: 'article', art: 'article', dissertation: 'thesis', these: 'thesis', thesis: 'thesis', hdr: 'thesis', mem: 'thesis',
  'book-chapter': 'chapter', chapter: 'chapter', couv: 'chapter', 'proceedings-article': 'chapter', comm: 'chapter', conference: 'chapter', review: 'review', preprint: 'preprint', 'posted-content': 'preprint',
  book: 'book', monograph: 'book', ouv: 'book'};
const dtype = (raw, title) => { let t = TYPE_MAP[plain(raw).replace(/\s/g, '')] || (/thes|dissert/.test(plain(raw)) ? 'thesis' : 'article');
  if (t === 'article' && /\breview\b|ανασκόπηση/i.test(title || '')) t = 'review'; return t; };
const clean = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
function srec(source, sid, title, authors, year, type, venue, doi, page, pdf, cited, abstract, lang){
  doi = String(doi || '').replace('https://doi.org/', '').toLowerCase();
  return {id: `sc-${source.slice(0, 3)}-${String(sid).replace(/[^\w.-]+/g, '_').slice(-60)}`, source, title: clean(title), author: [].concat(authors || []).filter(Boolean).join(', ').slice(0, 200),
    year: String(year || '').slice(0, 4), lang: normLang(lang), type, category: type, venue: clean(venue).slice(0, 160), doi, page: page || (doi ? 'https://doi.org/' + doi : ''),
    url: pdf || '', ext: pdf ? 'pdf' : '', kind: pdf ? 'free' : 'catalog', cited, abstract: clean(abstract).slice(0, 700), scholar: true, subjects: []};
}
async function openalex(term, y1, y2){
  const flt = ['type:article|review|dissertation|book-chapter|preprint|book']; if (y1) flt.push(`from_publication_date:${y1}-01-01`); if (y2) flt.push(`to_publication_date:${y2}-12-31`);
  const d = await getJSON('https://api.openalex.org/works?' + qs({search: term, 'per-page': 40, filter: flt.join(','), mailto: MAILTO,
    select: 'id,doi,title,publication_year,type,authorships,primary_location,best_oa_location,cited_by_count,language,abstract_inverted_index'}), 25000);
  return (d.results || []).map(w => { const inv = w.abstract_inverted_index || {}; const ab = Object.entries(inv).flatMap(([wd_, ps]) => ps.map(p => [p, wd_])).sort((a, b) => a[0] - b[0]).slice(0, 120).map(x => x[1]).join(' ');
    return srec('OpenAlex', w.id.split('/').pop(), w.title, (w.authorships || []).slice(0, 6).map(a => a.author?.display_name), w.publication_year, dtype(w.type, w.title),
      w.primary_location?.source?.display_name, w.doi, w.primary_location?.landing_page_url, w.best_oa_location?.pdf_url, w.cited_by_count, ab, w.language); });
}
async function crossref(term, y1, y2){
  let f = 'type:journal-article,type:dissertation,type:book-chapter,type:proceedings-article,type:posted-content'; if (y1) f += `,from-pub-date:${y1}`; if (y2) f += `,until-pub-date:${y2}`;
  const d = await getJSON('https://api.crossref.org/works?' + qs({query: term, rows: 30, filter: f, mailto: MAILTO}), 25000);
  return (d.message?.items || []).map(it => srec('Crossref', it.DOI, (it.title || [''])[0], (it.author || []).slice(0, 6).map(a => [a.given, a.family].filter(Boolean).join(' ')),
    it.issued?.['date-parts']?.[0]?.[0], dtype(it.type, (it.title || [''])[0]), (it['container-title'] || [it.institution?.[0]?.name || ''])[0], it.DOI, '', '', it['is-referenced-by-count'], it.abstract, it.language));
}
async function s2(term, y1, y2){
  const d = await getJSON('https://api.semanticscholar.org/graph/v1/paper/search?' + qs({query: term, limit: 40, year: y1 || y2 ? `${y1 || ''}-${y2 || ''}` : '',
    fields: 'title,authors,year,venue,citationCount,openAccessPdf,externalIds,publicationTypes,abstract,url'}), 25000);
  return (d.data || []).map(p => { const t = p.publicationTypes || []; const raw = t.includes('Review') ? 'review' : t.includes('Conference') ? 'conference' : 'article';
    return srec('Semantic Scholar', p.paperId, p.title, (p.authors || []).slice(0, 6).map(a => a.name), p.year, dtype(raw, p.title), p.venue, p.externalIds?.DOI, p.url, p.openAccessPdf?.url, p.citationCount, p.abstract); });
}
async function doaj(term, y1, y2){
  const q = y1 || y2 ? `${term} AND bibjson.year:[${y1 || 1000} TO ${y2 || 2100}]` : term;
  const d = await getJSON(`https://doaj.org/api/search/articles/${encodeURIComponent(q)}?pageSize=40`, 25000);
  return (d.results || []).map(r => { const b = r.bibjson || {}; const ft = (b.link || []).find(l => l.type === 'fulltext')?.url;
    const x = srec('DOAJ', r.id, b.title, (b.author || []).slice(0, 6).map(a => a.name), b.year, dtype('article', b.title), b.journal?.title,
      (b.identifier || []).find(i => /doi/i.test(i.type))?.id, ft, '', null, b.abstract, (b.journal?.language || [])[0]);
    return Object.assign(x, {kind: 'free', readOnly: true, read: ft || x.page}); });
}
async function epmc(term, y1, y2){
  const q = term + (y1 || y2 ? ` AND PUB_YEAR:[${y1 || 1000} TO ${y2 || 2100}]` : '');
  const d = await getJSON('https://www.ebi.ac.uk/europepmc/webservices/rest/search?' + qs({query: q, format: 'json', pageSize: 40, resultType: 'core'}), 25000);
  return (d.resultList?.result || []).map(r => { const pdf = (r.fullTextUrlList?.fullTextUrl || []).find(u => u.documentStyle === 'pdf' && ['OA', 'F'].includes(u.availabilityCode))?.url;
    const raw = r.source === 'ETH' ? 'thesis' : /review/i.test((r.pubTypeList?.pubType || []).join(' ')) ? 'review' : r.source === 'PPR' ? 'preprint' : 'article';
    return srec('Europe PMC', r.source + r.id, r.title, r.authorString, r.pubYear, dtype(raw, r.title), r.journalInfo?.journal?.title || (r.source === 'ETH' ? 'British Library EThOS' : ''),
      r.doi, `https://europepmc.org/article/${r.source}/${r.id}`, pdf, r.citedByCount, r.abstractText, r.language); });
}
async function hal(term, y1, y2){
  const p = [['q', term], ['wt', 'json'], ['rows', '40'], ['fl', 'docid,title_s,authFullName_s,producedDateY_i,docType_s,uri_s,fileMain_s,doiId_s,journalTitle_s,abstract_s,language_s'],
    ['fq', 'docType_s:(ART OR THESE OR HDR OR COMM OR COUV OR OUV OR MEM)']];
  if (y1 || y2) p.push(['fq', `producedDateY_i:[${y1 || 1000} TO ${y2 || 2100}]`]);
  const d = await getJSON('https://api.archives-ouvertes.fr/search/?' + new URLSearchParams(p), 25000);
  return (d.response?.docs || []).map(x => srec('HAL', x.docid, (x.title_s || [''])[0], (x.authFullName_s || []).slice(0, 6), x.producedDateY_i, dtype(x.docType_s, (x.title_s || [''])[0]),
    x.journalTitle_s || (['THESE', 'HDR'].includes(x.docType_s) ? 'Διατριβή (HAL)' : ''), x.doiId_s, x.uri_s, x.fileMain_s, null, (x.abstract_s || [''])[0], (x.language_s || [''])[0]));
}
async function arxiv(term, y1, y2){
  const xml = await getText('https://export.arxiv.org/api/query?' + qs({search_query: `all:"${term}"`, max_results: 20}), 20000);
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return [...doc.getElementsByTagName('entry')].map(e => { const g = t => e.getElementsByTagName(t)[0]?.textContent || ''; const y = g('published').slice(0, 4);
    const pdf = [...e.getElementsByTagName('link')].find(l => l.getAttribute('title') === 'pdf')?.getAttribute('href') || '';
    return srec('arXiv', g('id').split('/').pop(), g('title'), [...e.getElementsByTagName('author')].map(a => a.textContent.trim()).slice(0, 6), y, 'preprint', 'arXiv', '', g('id'), pdf.replace('http:', 'https:'), null, g('summary'), 'en'); })
    .filter(r => !((y1 && +r.year < y1) || (y2 && +r.year > y2)));
}
const SCH_LINKS = (el, en) => [['Google Scholar', `https://scholar.google.com/scholar?q=${encodeURIComponent(en)}`],
  ['ΕΑΔΔ — ελληνικές διδακτορικές διατριβές', `https://www.didaktorika.gr/eadd/simple-search?query=${encodeURIComponent(el || en)}`],
  ['Κάλλιπος — ελληνικά ακαδημαϊκά συγγράμματα', `https://repository.kallipos.gr/discover?query=${encodeURIComponent(el || en)}`],
  ['BASE', `https://www.base-search.net/Search/Results?lookfor=${encodeURIComponent(en)}`], ['OATD — διατριβές', `https://oatd.org/oatd/search?q=${encodeURIComponent(en)}`],
  ['CORE', `https://core.ac.uk/search?q=${encodeURIComponent(en)}`]];

// ───────────── ένωση αποτελεσμάτων ─────────────
const surname = a => { a = String(a || '').split(/;|,\s(?=[A-ZΑ-Ω][a-zα-ω]+\s[A-ZΑ-Ω])/)[0]; if (a.includes(',')) return a.split(',')[0].trim(); const p = a.match(/[\p{L}'’-]+/gu) || []; return p.at(-1) || ''; };
function key(r){
  if (r.doi) return 'doi:' + r.doi;
  const t = plain(String(r.title || r.publication).split(/\s[:;/]\s|\s[-–—]\s|\(/)[0]).match(/[\p{L}\p{N}]+/gu)?.filter(w => !STOPW.has(w)).slice(0, 8).join(' ') || r.id;
  return r.press ? r.id : t + '|' + plain(surname(r.author)).slice(0, 5);
}
function merge(list){
  const by = new Map();
  for (const r of list){
    if (!(r.title || r.publication)) continue;
    r.sources = r.sources || [{source: r.source, page: r.page, kind: r.kind, price: r.price}];
    const k = key(r), m = by.get(k);
    if (!m){ by.set(k, r); continue; }
    if (!m.sources.some(s => s.source === r.source)) m.sources.push(...r.sources);
    for (const f of ['abstract', 'venue', 'year', 'lang', 'author', 'doi']) if (!m[f] && r[f]) m[f] = r[f];
    m.subjects = [...new Set([...(m.subjects || []), ...(r.subjects || [])])].slice(0, 30);
    if (r.kind === 'free' && !r.readOnly && (m.kind !== 'free' || m.readOnly)) Object.assign(m, {kind: 'free', readOnly: false, url: r.url, ext: r.ext, ia: r.ia, read: null});
    if (r.kind === 'paid' && m.kind === 'catalog') Object.assign(m, {kind: 'paid', price: r.price, buy: r.buy});
    if ((r.cited || 0) > (m.cited || 0)) m.cited = r.cited;
  }
  return [...by.values()];
}

// ───────────── εκτέλεση αναζήτησης ─────────────
async function runAll(jobs){
  const stats = {}, errs = {}, out = [];
  await Promise.all(jobs.map(async ([name, p]) => {
    try { const r = await p; stats[name] = (stats[name] || 0) + r.length; out.push(...r); }
    catch (e) { stats[name] = stats[name] || 0; errs[name] = e.name === 'AbortError' ? 'δεν απάντησε εγκαίρως' : e.message; }
  }));
  return {out, stats, errs};
}
async function search(text){
  const focus = $('#focus').value.trim(), rel = $('#rel').value;
  let y1 = +$('#y1').value || null, y2 = +$('#y2').value || null;
  setBusy(true);
  $('#out').innerHTML = `<p class="msg"><span class="spin"></span>${text.split(/\s+/).length > 4 ? 'Διαβάζω την ερώτηση και ψάχνω…' : 'Ψάχνω σε όλες τις γλώσσες…'}</p>`;
  try {
    const u = await understand(text);
    if (!y1 && u.y1){ y1 = u.y1; y2 = u.y2; }
    const fv = await focusVariants(focus);
    const seenT = new Set();
    const terms = Object.entries(u.byLang).filter(([, t]) => t && !seenT.has(plain(t)) && seenT.add(plain(t)));
    const en = u.byLang.en || u.topic, el = u.byLang.el || (/[Ͱ-Ͽ]/.test(text) ? u.topic : '');
    const jobs = [];
    const fl = l => fv.length ? ' ' + (fv.find(v => (l === 'el') === /[Ͱ-Ͽ]/.test(v)) || fv[0]) : '';
    if (state.mode === 'books'){
      for (const [l, t] of terms.slice(0, 6)){
        jobs.push(['Internet Archive', archive(t + fl(l), l)], ['Open Library', openlibrary(t, l)], ['Google Books', google(t, l)]);
        if (l !== 'el') jobs.push(['Project Gutenberg', gutendex(t, l)]);
      }
      jobs.push(['Europeana', europeana(el || en, 'el', [['qf', 'TYPE:TEXT']])], ['Ελληνικά αρχεία (Europeana)', europeana(el || en, 'el', [['qf', 'TYPE:TEXT'], ['qf', 'COUNTRY:greece']])]);
    } else if (isPress()){
      const fr = u.byLang.fr || en, news = state.mode === 'news';
      jobs.push(['Internet Archive', pressArchive(en + fl('en'), y1, y2, news)], ['Gallica', pressGallica(fr + fl('fr'), y1, y2, news)]);
      if (news){
        jobs.push(['Europeana', pressEuropeana(en + fl('en'), y1, y2)]);
        if (u.byLang.de) jobs.push(['Europeana', pressEuropeana(u.byLang.de, y1, y2)]);
      }
      if (el) jobs.push(['Ελληνικά αρχεία (Europeana)', europeana(el, 'el', [...(news ? [['theme', 'newspaper']] : []), ['qf', 'COUNTRY:greece']]).then(r => r.map(x => ({...x, publication: x.title, date: x.year, press: true})))]);
    } else {
      for (const t of [...new Set([en + fl('en'), el && el + fl('el'), u.byLang.fr, u.byLang.de].filter(Boolean))]) jobs.push(['OpenAlex', openalex(t, y1, y2)]);
      jobs.push(['Crossref', crossref(en + fl('en'), y1, y2)], ['Semantic Scholar', s2(en + fl('en'), y1, y2)], ['DOAJ', doaj(en, y1, y2)], ['Europe PMC', epmc(en, y1, y2)],
        ['HAL', hal(u.byLang.fr || en, y1, y2)], ['arXiv', arxiv(en, y1, y2)]);
    }
    const {out, stats, errs} = await runAll(jobs);
    let res = merge(out);
    const tm = matcher([...terms.map(([, t]) => t), ...u.concepts]), fm = fv.length ? matcher(fv) : null;
    let dropped = 0, relaxed = false;
    if (state.mode === 'theses') res = res.filter(r => r.type === 'thesis');
    if (state.mode === 'articles') res = res.filter(r => r.type !== 'thesis');
    if (!isPress()){
      res.forEach(r => { score(r, tm, fm); if (!r.scholar) r.category = classify(r); });
      const all = res; res = all.filter(r => r.relevance >= MIN[rel]); dropped = all.length - res.length;
      if (res.length < 5 && MIN[rel] > 1 && dropped){ res = all.filter(r => r.relevance >= 1); dropped = all.length - res.length; relaxed = true; }
      if (!res.length && all.length){ res = all; dropped = 0; relaxed = 'all'; }
      res.sort((a, b) => b.relevance - a.relevance || (b.cited || 0) - (a.cited || 0) || b.sources.length - a.sources.length);
    } else {
      res = res.filter(r => !y1 || !r.date || inYears(r.date, y1, y2)).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    }
    state.results = res; state.view = isPress() ? 'all' : res.some(r => r.kind === 'free') ? 'free' : 'all';
    state.cat = ''; state.lang = ''; state.shown = 30; state.q = text;
    state.links = isPress() ? PRESS_LINKS(el, en) : isSch() ? SCH_LINKS(el, en) : [];
    render({u, stats, errs, dropped, relaxed, focus, fv, y1, y2, terms});
    try { localStorage.setItem('vv_last', JSON.stringify({q: text, mode: state.mode})); } catch (e) {}
  } catch (e) {
    $('#out').innerHTML = `<p class="msg note err">Κάτι πήγε στραβά: ${esc(e.message)}. Έλεγξε τη σύνδεση και ξαναδοκίμασε.</p>`;
  } finally { setBusy(false); }
}
const isPress = () => state.mode === 'news' || state.mode === 'mags';
const isSch = () => state.mode === 'articles' || state.mode === 'theses';
const inYears = (d, a, b) => { const ys = (String(d).match(/(?<!\d)(1[4-9]\d\d|20\d\d)(?!\d)/g) || []).map(Number); if (!ys.length) return true; return (!a || Math.max(...ys) >= a) && (!b || Math.min(...ys) <= b); };

// ───────────── εμφάνιση ─────────────
function setBusy(b){ $('#go').disabled = b; }
const KIND = {free: 'Δωρεάν', paid: 'Επί πληρωμή', catalog: 'Κατάλογος', all: 'Όλα'};
const SKIND = {free: 'Ελεύθερη πρόσβαση', paid: 'Επί πληρωμή', catalog: 'Με συνδρομή', all: 'Όλα'};
function render(ctx){
  const r = state.results, isP = isPress(), isS = isSch();
  const okSrc = Object.entries(ctx.stats).filter(([, n]) => n).length;
  let head = '';
  if (ctx.u.sentence) head += `<span class="und">Κατάλαβα: ${[...ctx.u.concepts, ...ctx.u.keywords].map(c => '«' + esc(c) + '»').join(', ')}${ctx.y1 ? ` · ${ctx.y1}–${ctx.y2}` : ''}</span>\n`;
  else if (ctx.y1) head += `<span class="und">Περίοδος ${ctx.y1}–${ctx.y2}</span>\n`;
  if (ctx.focus) head += `<span class="und">🎯 ${esc(ctx.focus)}${ctx.fv.length > 1 ? ' (+' + (ctx.fv.length - 1) + ' μορφές ονόματος)' : ''}</span>\n`;
  const free = r.filter(x => x.kind === 'free').length, paid = r.filter(x => x.kind === 'paid').length, cat = r.filter(x => x.kind === 'catalog').length;
  let txt = !r.length ? (Object.keys(ctx.errs).length >= Object.keys(ctx.stats).length ? 'Δεν μπόρεσα να συνδεθώ με τις βιβλιοθήκες. Έλεγξε τη σύνδεση.' : 'Δεν βρήκα αποτελέσματα. Δοκίμασε πιο γενικό θέμα ή «Όλα» στη σχετικότητα.')
    : isP ? `Βρήκα ${r.length} τεύχη εφημερίδων/περιοδικών από ${okSrc} αρχεία.`
    : isS ? `🎓 ${r.length} επιστημονικές δημοσιεύσεις από ${okSrc} βάσεις: ${r.filter(x => x.url).length} με ελεύθερο PDF, ${free - r.filter(x => x.url).length} για ανάγνωση online, ${cat} με συνδρομή.`
    : `Βρήκα ${r.length} έργα: ${free} δωρεάν, ${paid} επί πληρωμή, ${cat} σε καταλόγους. ${r.filter(x => x.sources.length > 1).length} επιβεβαιώνονται σε περισσότερες πηγές.`;
  if (ctx.relaxed === 'all') txt += ' Κανένα δεν αναφέρει ρητά το θέμα στον τίτλο ή στην περίληψη — τα δείχνω όλα, έλεγξέ τα.';
  else if (ctx.relaxed && r.length) txt += ' Λίγα ήταν σαφώς σχετικά — δείχνω και τα λιγότερο σχετικά, με σειρά σχετικότητας.';
  else if (ctx.dropped) txt += ` Έκρυψα ${ctx.dropped} άσχετα.`;
  if (!r.length) txt += ' Δοκίμασε τα κουμπιά παραπάνω για άλλο είδος πηγών.';
  const st = Object.entries(ctx.stats).map(([k, n]) => `<span class="${ctx.errs[k] && !n ? 'e' : ''}" title="${esc(ctx.errs[k] || '')}">${esc(k)} ${ctx.errs[k] && !n ? '—' : n}</span>`).join('');
  const terms = ctx.terms.length > 1 ? `<div class="terms">Όροι: ${ctx.terms.map(([l, t]) => `<i title="${esc(LANGS[l] || l)}">${esc(t)}</i>`).join('')}</div>` : '';
  const kinds = `<div class="kinds"><span>Το ίδιο θέμα σε:</span>${Object.entries(MODES).map(([k, n]) => `<button data-kind="${k}" class="${k === state.mode ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  $('#out').innerHTML = `${kinds}<div class="msg">${head}${esc(txt)}</div><div class="stats">${st}</div>${terms}<div id="res"></div>` +
    (state.links.length ? `<div class="links"><b>Ψάξε επίσης απευθείας σε:</b>${state.links.map(([n, u]) => `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener">${esc(n)} ↗</a>`).join('')}</div>` : '');
  drawList();
  $('#out').querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { if (b.dataset.kind === state.mode) return; setMode(b.dataset.kind, true); search(state.q); });
}
function visible(){
  return state.results.filter(r => (state.view === 'all' || r.kind === state.view) && (!state.cat || r.category === state.cat) && (!state.lang || r.lang === state.lang));
}
function drawList(){
  const box = $('#res'); if (!box) return;
  const all = state.results, isP = isPress(), isS = isSch(), K = isS ? SKIND : KIND;
  if (!all.length){ box.innerHTML = ''; return; }
  const cnt = v => all.filter(r => v === 'all' || r.kind === v).length;
  const cats = [...new Set(all.map(r => r.category).filter(Boolean))], langs = [...new Set(all.map(r => r.lang).filter(Boolean))];
  const vis = visible();
  box.innerHTML = `<div class="box"><div class="bar">${isP ? '' : `<div class="seg">${Object.keys(K).filter(v => v === 'all' || cnt(v)).map(v => `<button data-v="${v}" class="${state.view === v ? 'on' : ''}">${K[v]} (${cnt(v)})</button>`).join('')}</div>`}
    ${cats.length > 1 ? `<select id="fc"><option value="">Όλες οι κατηγορίες</option>${cats.map(c => `<option value="${c}" ${c === state.cat ? 'selected' : ''}>${esc(CATS[c] || c)}</option>`).join('')}</select>` : ''}
    ${langs.length > 1 ? `<select id="fl"><option value="">Όλες οι γλώσσες</option>${langs.map(l => `<option value="${l}" ${l === state.lang ? 'selected' : ''}>${esc(LANGS[l] || l)}</option>`).join('')}</select>` : ''}</div>
    <div id="cards">${vis.slice(0, state.shown).map(isP ? pcard : card).join('') || '<div class="empty">Τίποτα σε αυτό το φίλτρο.</div>'}</div>
    ${vis.length > state.shown ? `<button class="morebtn" id="moreBtn">Δείξε περισσότερα (${vis.length - state.shown})</button>` : ''}</div>`;
  box.querySelectorAll('[data-v]').forEach(b => b.onclick = () => { state.view = b.dataset.v; state.shown = 30; drawList(); });
  $('#fc') && ($('#fc').onchange = e => { state.cat = e.target.value; state.shown = 30; drawList(); });
  $('#fl') && ($('#fl').onchange = e => { state.lang = e.target.value; state.shown = 30; drawList(); });
  $('#moreBtn') && ($('#moreBtn').onclick = () => { state.shown += 30; drawList(); });
}
const byId = id => state.results.find(r => r.id === id) || listsAll().find(r => r.id === id);
function citation(r){
  if (r.press) return [r.publication, r.date].filter(Boolean).join(', ');
  if (r.scholar) return [r.author, r.year ? `(${r.year})` : '', r.title + '.', r.venue ? r.venue + '.' : '', r.doi ? 'https://doi.org/' + r.doi : ''].filter(Boolean).join(' ');
  return [r.title, [r.author, r.year].filter(Boolean).join(', ')].filter(Boolean).join(' — ');
}
function card(r){
  const badge = r.kind === 'paid' ? '€' : r.kind === 'catalog' ? '▤' : r.readOnly ? 'web' : (r.ext || 'pdf');
  const cls = r.kind === 'paid' ? 'paid' : r.kind === 'catalog' ? 'cat' : r.readOnly ? 'web' : r.ext;
  const meta = [r.author, r.year, r.sources.length > 1 ? '' : r.source, r.venue, r.cited ? `${r.cited} παραθέσεις` : '', r.note].filter(Boolean).map(esc).join(' · ');
  const relb = r.level && r.level !== 'none' ? `<span class="rel ${r.level}" title="${esc((r.why || []).join(' · '))}">${r.level === 'high' ? '●●● πολύ σχετικό' : r.level === 'medium' ? '●● σχετικό' : '● λίγο σχετικό'}</span>` : '';
  const srcs = r.sources.length > 1 ? `<span class="pill" title="${esc(r.sources.map(s => s.source).join(', '))}">✓ ${r.sources.length} πηγές</span>` : '';
  let act = '';
  if (r.kind === 'free' && !r.readOnly) act += `<button class="btn pri" data-dl="${esc(r.id)}">↓ Λήψη ${esc((r.ext || '').toUpperCase())}</button>`;
  if (r.readOnly) act += `<a class="btn" href="${esc(r.read || r.page)}" target="_blank" rel="noopener">Ανάγνωση ↗</a>`;
  if (r.kind === 'paid') act += `${r.price ? `<span class="pill cat">${esc(r.price)}</span>` : ''}<a class="btn gold" href="${esc(r.buy || r.page)}" target="_blank" rel="noopener">Αγορά ↗</a>`;
  if (r.kind !== 'free' || r.readOnly) act += `<button class="btn" data-hunt="${esc(r.id)}" title="Ψάχνει το ίδιο βιβλίο σε Gutenberg, Open Library και Internet Archive">🔎 Βρες δωρεάν</button>`;
  act += `<button class="btn" data-add="${esc(r.id)}">+ Λίστα</button><button class="btn" data-share="${esc(r.id)}">Κοινοποίηση</button>`;
  return `<div class="card"><div class="fmt ${esc(cls)}">${esc(badge)}</div><div class="info">
    <div class="t"><a href="${esc(r.page)}" target="_blank" rel="noopener">${esc(r.title)}</a><button class="cp" data-cp="${esc(r.id)}" title="Αντιγραφή ${r.scholar ? 'παραπομπής' : 'τίτλου'}">⧉</button></div>
    <div class="meta">${relb}${r.lang ? `<span class="pill">${esc(LANGS[r.lang] || r.lang)}</span>` : ''}${r.category ? `<span class="pill cat">${esc(CATS[r.category] || r.category)}</span>` : ''}${srcs}<span>${meta}</span></div>
    ${r.abstract ? `<details class="abs"><summary>Περίληψη</summary><p>${esc(r.abstract)}</p></details>` : ''}
    <div class="acts">${act}</div><div class="note" id="n-${esc(r.id)}"></div></div></div>`;
}
function pcard(r){
  return `<div class="card"><div class="fmt press">📰</div><div class="info">
    <div class="t"><a href="${esc(r.page)}" target="_blank" rel="noopener">${esc(r.publication)}</a><button class="cp" data-cp="${esc(r.id)}" title="Αντιγραφή">⧉</button></div>
    <div class="meta"><span class="pill">${esc(r.date || 'χωρίς ημερομηνία')}</span>${r.lang ? `<span class="pill">${esc(LANGS[r.lang] || r.lang)}</span>` : ''}<span>${esc([r.place, r.source].filter(Boolean).join(' · '))}</span></div>
    <div class="acts"><a class="btn pri" href="${esc(r.page)}" target="_blank" rel="noopener">Άνοιγμα ↗</a><button class="btn" data-add="${esc(r.id)}">+ Λίστα</button><button class="btn" data-share="${esc(r.id)}">Κοινοποίηση</button></div></div></div>`;
}

// ───────────── ενέργειες ─────────────
const IA_FMT = {epub: ['EPUB'], pdf: ['Text PDF', 'PDF', 'Additional Text PDF', 'Image Container PDF'], txt: ['DjVuTXT', 'Text']};
async function resolveIA(ident){
  const m = await getJSON(`https://archive.org/metadata/${encodeURIComponent(ident)}`, 20000);
  if (m.is_dark) throw new Error('δεν είναι διαθέσιμο');
  for (const [ext, fs] of Object.entries(IA_FMT)){
    const f = (m.files || []).find(x => fs.includes(x.format) && !x.private);
    if (f) return {url: `https://archive.org/download/${ident}/${encodeURIComponent(f.name)}`, ext};
  }
  throw new Error('δεν βρέθηκε ελεύθερο αρχείο');
}
async function download(r, btn){
  const n = $('#n-' + CSS.escape(r.id));
  try {
    btn && (btn.disabled = true);
    let url = r.url, ext = r.ext;
    if (r.ia){ n && (n.innerHTML = '<span class="spin"></span>Βρίσκω το αρχείο…'); ({url, ext} = await resolveIA(r.ia)); }
    if (!url) throw new Error('δεν υπάρχει αρχείο');
    window.open(url, '_blank', 'noopener');
    if (n){ n.className = 'note ok'; n.innerHTML = `Άνοιξε το ${esc(ext.toUpperCase())} — αν δεν ξεκίνησε, <a href="${esc(url)}" target="_blank" rel="noopener">πάτα εδώ</a>.`; }
  } catch (e) {
    if (n){ n.className = 'note err'; n.textContent = 'Δεν κατέβηκε: ' + e.message + '. Δοκιμάζω άλλες πηγές…'; }
    hunt(r);
  } finally { btn && (btn.disabled = false); }
}
const sameTitle = (a, b) => { const w = s => new Set(plain(String(s).split(/\s[:;/]\s|\s[-–—]\s|\(/)[0]).match(/[\p{L}\p{N}]+/gu)?.filter(x => x.length > 1 && !STOPW.has(x)) || []);
  const A = w(a), B = w(b); if (!A.size || !B.size) return false; const i = [...A].filter(x => B.has(x)).length; return i / Math.min(A.size, B.size) >= .8 && i / Math.max(A.size, B.size) >= .5; };
const sameAuthor = (a, b) => { const x = plain(surname(a)), y = plain(surname(b)); return !x || !y || x.slice(0, 5) === y.slice(0, 5); };
async function hunt(r){
  const n = $('#n-' + CSS.escape(r.id)); if (n){ n.className = 'note'; n.innerHTML = '<span class="spin"></span>Ψάχνω το ίδιο βιβλίο σε Gutenberg, Open Library και Internet Archive…'; }
  const t = String(r.title).split(/\s[:;/]\s|\(/)[0], sn = surname(r.author);
  const tries = await Promise.allSettled([gutendex(`${t} ${sn}`.trim(), 'en'), openlibrary(`${t} ${sn}`.trim(), ''), archive(`${t}`, '')]);
  const cands = tries.flatMap(x => x.status === 'fulfilled' ? x.value : []).filter(c => c.kind === 'free' && !c.readOnly && sameTitle(r.title, c.title) && sameAuthor(r.author, c.author));
  if (!cands.length){
    const q = encodeURIComponent(`${t} ${sn}`.trim());
    if (n){ n.className = 'note err'; n.innerHTML = `Δεν βρέθηκε δωρεάν νόμιμο αντίτυπο. <a href="https://openlibrary.org/search?q=${q}" target="_blank" rel="noopener">Δανεισμός (Open Library)</a> · <a href="https://search.worldcat.org/search?q=${q}" target="_blank" rel="noopener">Σε ποιες βιβλιοθήκες υπάρχει</a>`; }
    return;
  }
  const c = cands[0];
  if (n){ n.className = 'note ok'; n.innerHTML = `Βρέθηκε δωρεάν στο ${esc(c.source)}: <button class="btn pri" data-dlx="1">↓ Λήψη</button>`;
    n.querySelector('[data-dlx]').onclick = () => download(c); }
}
function toast(t){ const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 1800); }
async function copy(t){ try { await navigator.clipboard.writeText(t); } catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); } toast('Αντιγράφηκε'); }
async function share(r){
  const data = {title: r.title || r.publication, text: citation(r), url: r.page};
  if (navigator.share) { try { await navigator.share(data); return; } catch (e) { if (e.name === 'AbortError') return; } }
  copy(`${data.text}\n${data.url}`);
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-dl],[data-hunt],[data-add],[data-share],[data-cp]'); if (!b) return;
  const id = b.dataset.dl || b.dataset.hunt || b.dataset.add || b.dataset.share || b.dataset.cp, r = byId(id); if (!r) return;
  if (b.dataset.dl) download(r, b); else if (b.dataset.hunt) hunt(r); else if (b.dataset.add) addToList(r, b);
  else if (b.dataset.share) share(r); else copy(citation(r));
});

// ───────────── λίστες (στη συσκευή) ─────────────
function lists(){ try { return JSON.parse(localStorage.getItem('vv_lists') || '[]'); } catch (e) { return []; } }
function saveLists(l){ try { localStorage.setItem('vv_lists', JSON.stringify(l)); } catch (e) { toast('Δεν αποθηκεύτηκε (ιδιωτική περιήγηση;)'); } }
const listsAll = () => lists().flatMap(l => l.items);
const slim = r => Object.fromEntries(Object.entries(r).filter(([k]) => ['id', 'title', 'publication', 'author', 'year', 'date', 'lang', 'kind', 'ext', 'url', 'ia', 'page', 'source', 'sources',
  'category', 'venue', 'doi', 'cited', 'scholar', 'press', 'readOnly', 'read', 'price', 'buy'].includes(k)));
function addToList(r, btn){
  let l = lists();
  const cur = localStorage.getItem('vv_curlist');
  let target = l.find(x => x.id === cur);
  if (!target){ dlgLists(r); return; }
  if (!target.items.some(i => i.id === r.id)) target.items.push(slim(r));
  saveLists(l); toast(`Προστέθηκε στη λίστα «${target.name}»`); if (btn) btn.textContent = '✓ ' + target.name.slice(0, 18);
}
function dlgLists(pending){
  const l = lists(), cur = localStorage.getItem('vv_curlist');
  $('#dlgBody').innerHTML = `<button class="x" onclick="dlg.close()">✕</button><h3>Οι λίστες μου</h3>
    <p class="note">Οι λίστες σου (έρευνες, βιβλιογραφίες) μένουν σε αυτή τη συσκευή.${pending ? ' Διάλεξε λίστα για: <b>' + esc(pending.title || pending.publication) + '</b>' : ''}</p>
    <form class="row" id="nl" style="margin:10px 0"><input name="n" placeholder="Νέα λίστα, π.χ. «Σμύρνη 1922»" required><button class="btn pri">Δημιουργία</button></form>
    ${l.map(x => `<div class="list" data-l="${x.id}"><div class="n">${esc(x.name)} ${x.id === cur ? '<span class="pill cat">ενεργή</span>' : ''}</div><div class="c">${x.items.length} πηγές · ${esc(x.created)}</div></div>`).join('') || '<p class="note">Δεν έχεις λίστες ακόμα.</p>'}`;
  $('#nl').onsubmit = e => { e.preventDefault(); const L = lists(); const x = {id: 'l' + Date.now(), name: e.target.n.value.trim(), created: new Date().toLocaleDateString('el-GR'), items: []};
    L.unshift(x); saveLists(L); localStorage.setItem('vv_curlist', x.id); if (pending){ addToList(pending); dlg.close(); } else dlgLists(); };
  $('#dlgBody').querySelectorAll('[data-l]').forEach(d => d.onclick = () => { localStorage.setItem('vv_curlist', d.dataset.l); if (pending){ addToList(pending); dlg.close(); } else dlgList(d.dataset.l); });
  if (!dlg.open) dlg.showModal();
}
function apa(r){
  if (r.press) return `${r.publication}. (${r.date || 'χ.χ.'}). ${r.source}. ${r.page}`;
  const doi = r.doi ? ` https://doi.org/${r.doi}` : r.page ? ` ${r.page}` : '';
  return `${r.author || 'Άγνωστος'} (${r.year || 'χ.χ.'}). ${r.title}.${r.venue ? ' ' + r.venue + '.' : ''}${doi}`;
}
function bibtex(items){ return items.map((r, i) => { const k = (plain(surname(r.author)) || 'anon').replace(/\W/g, '') + (r.year || '') + i;
  return `@${r.scholar ? 'article' : r.press ? 'misc' : 'book'}{${k},\n  title = {${r.title || r.publication}},\n  author = {${(r.author || '').replace(/;\s*/g, ' and ')}},\n  year = {${r.year || String(r.date || '').slice(0, 4)}},${r.venue ? `\n  journal = {${r.venue}},` : ''}${r.doi ? `\n  doi = {${r.doi}},` : ''}\n  url = {${r.page}}\n}`; }).join('\n\n'); }
function ris(items){ return items.map(r => [`TY  - ${r.scholar ? 'JOUR' : r.press ? 'NEWS' : 'BOOK'}`, `TI  - ${r.title || r.publication}`,
  ...String(r.author || '').split(/;\s*/).filter(Boolean).map(a => `AU  - ${a}`), `PY  - ${r.year || String(r.date || '').slice(0, 4)}`, r.venue ? `JO  - ${r.venue}` : '', r.doi ? `DO  - ${r.doi}` : '', `UR  - ${r.page}`, 'ER  - '].filter(Boolean).join('\r\n')).join('\r\n\r\n'); }
function saveFile(name, text, type){ const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function dlgList(id){
  const L = lists(), x = L.find(y => y.id === id); if (!x) return dlgLists();
  $('#dlgBody').innerHTML = `<button class="x" onclick="dlg.close()">✕</button><h3>${esc(x.name)}</h3>
    <div class="row" style="margin-bottom:8px"><button class="btn" id="bk">← Λίστες</button><button class="btn" id="cpA">Αντιγραφή βιβλιογραφίας</button>
    <button class="btn" id="bib">.bib</button><button class="btn" id="ris">.ris (Zotero)</button><button class="btn" id="del" style="margin-left:auto;color:var(--err)">Διαγραφή λίστας</button></div>
    ${x.items.map(r => `<div class="li"><div class="info"><a href="${esc(r.page)}" target="_blank" rel="noopener"><b>${esc(r.title || r.publication)}</b></a><div class="note">${esc(apa(r))}</div>
      <div class="acts">${r.kind === 'free' && !r.readOnly && !r.press ? `<button class="btn pri" data-dl="${esc(r.id)}">↓ Λήψη</button>` : ''}<button class="btn" data-cp="${esc(r.id)}">⧉</button><button class="btn" data-rm="${esc(r.id)}">Αφαίρεση</button></div><div class="note" id="n-${esc(r.id)}"></div></div></div>`).join('') || '<p class="note">Άδεια λίστα — πρόσθεσε πηγές με «+ Λίστα».</p>'}`;
  $('#bk').onclick = () => dlgLists();
  $('#cpA').onclick = () => copy(x.items.map(apa).sort().join('\n'));
  $('#bib').onclick = () => saveFile(x.name + '.bib', bibtex(x.items), 'application/x-bibtex');
  $('#ris').onclick = () => saveFile(x.name + '.ris', ris(x.items), 'application/x-research-info-systems');
  $('#del').onclick = () => { if ($('#del').dataset.sure){ saveLists(lists().filter(y => y.id !== id)); dlgLists(); } else { $('#del').dataset.sure = 1; $('#del').textContent = 'Σίγουρα; Πάτα ξανά'; } };
  $('#dlgBody').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { const L2 = lists(); const y = L2.find(z => z.id === id); y.items = y.items.filter(i => i.id !== b.dataset.rm); saveLists(L2); dlgList(id); });
}

// ───────────── αρχικοποίηση ─────────────
const dlg = $('#dlg');
const MODES = {books: '📖 Βιβλία', news: '📰 Εφημερίδες', mags: '🗞 Περιοδικά', articles: '🎓 Επιστημονικά άρθρα', theses: '🎓 Διατριβές'};
const EX = {books: ['μελισσοκομία', 'Μινωικός πολιτισμός', 'Πώς ζούσαν οι μελισσοκόμοι στην Κρήτη τον 19ο αιώνα;', 'Κρητική επανάσταση 1866'],
  news: ['Σμύρνη 1922', 'Κρητική επανάσταση 1866-1869', 'Τιτανικός 1912', 'Μάχη της Κρήτης 1941'],
  mags: ['ναυάγιο Περσεύς', 'μελισσοκομία 1900-1930', 'Μινωικός πολιτισμός', 'αεροπορία 1910-1920'],
  articles: ['ιστορία της μελισσοκομίας', 'Μινωική γραφή Γραμμική Α', 'climate change and olive cultivation in Crete', 'Μικρασιατική καταστροφή'],
  theses: ['Μικρασιατική καταστροφή', 'μελισσοκομία στην Κρήτη', 'Ενετοκρατία Κρήτη', 'υποβρύχια αρχαιολογία']};
const INTRO = {books: 'Γράψε ένα θέμα <b>ή μια ολόκληρη ερώτηση</b>: ψάχνω σε όλες τις γλώσσες σε Gutenberg, Internet Archive, Open Library, Google Books και Europeana, ενώνω τα ίδια βιβλία και δείχνω ποια κατεβαίνουν δωρεάν.',
  news: 'Εφημερίδες εποχής από Internet Archive, Gallica και ευρωπαϊκές εθνικές βιβλιοθήκες. Βάλε έτη για να περιορίσεις την περίοδο.',
  mags: 'Περιοδικά, επιθεωρήσεις και δελτία εποχής από Internet Archive, Gallica και ελληνικά αρχεία.',
  articles: '<b>Μόνο επιστημονικά άρθρα</b> (περιοδικά με κριτές, πρακτικά, ανασκοπήσεις) από OpenAlex, Crossref, Semantic Scholar, DOAJ, Europe PMC, HAL και arXiv — με παραθέσεις, περίληψη και ελεύθερο PDF.',
  theses: '<b>Διδακτορικές και μεταπτυχιακές διατριβές</b> από OpenAlex, HAL, Europe PMC (βρετανικές διατριβές) και άλλες βάσεις — και σύνδεσμοι για το ελληνικό ΕΑΔΔ.'};
function setMode(m, keep){
  state.mode = m; document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  if (!keep && (!state.results.length || $('#examples'))){
    $('#out').innerHTML = `<div class="examples" id="examples">${EX[m].map(x => `<button class="chip">${esc(x)}</button>`).join('')}</div><p class="intro">${INTRO[m]}</p>`;
    $('#examples').querySelectorAll('.chip').forEach(c => c.onclick = () => { $('#q').value = c.textContent; search(c.textContent); });
  }
}
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => { const had = state.results.length; const q = $('#q').value.trim() || state.q;
  setMode(b.dataset.m, had && q); if (had && q) search(q); });
$('#sf').onsubmit = e => { e.preventDefault(); const q = $('#q').value.trim(); if (q) search(q); };
$('#q').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); $('#sf').requestSubmit(); } });
$('#q').addEventListener('input', e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(160, e.target.scrollHeight) + 'px'; });
$('#listsBtn').onclick = () => dlgLists();
$('#aboutBtn').onclick = () => {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  $('#dlgBody').innerHTML = `<button class="x" onclick="dlg.close()">✕</button><h3>Βιβλιοθηκάριος</h3>
    <p>Βρίσκει βιβλία, τύπο της εποχής και επιστημονικές δημοσιεύσεις σε όλες τις γλώσσες και δείχνει ποια διατίθενται νόμιμα δωρεάν.</p>
    <p><b>Εγκατάσταση ως εφαρμογή</b><br>${ios ? 'iPhone/iPad: πάτα <b>Κοινοποίηση</b> (το τετράγωνο με το βέλος) → <b>Προσθήκη στην οθόνη Αφετηρίας</b>.' : 'Android: μενού του Chrome (⋮) → <b>Εγκατάσταση εφαρμογής</b> ή <b>Προσθήκη στην αρχική οθόνη</b>.'}</p>
    <p><b>Απόρρητο</b><br>Δεν υπάρχει λογαριασμός ούτε διακομιστής: οι αναζητήσεις πάνε απευθείας από τη συσκευή σου στις βιβλιοθήκες, και οι λίστες σου μένουν μόνο σε αυτή τη συσκευή.</p>
    <p><b>Πηγές</b><br>Project Gutenberg, Internet Archive, Open Library, Google Books, Europeana, Wikidata, Gallica, OpenAlex, Crossref, Semantic Scholar, DOAJ, Europe PMC, HAL, arXiv. Μόνο νόμιμα ελεύθερα αντίτυπα — όσα έχουν πνευματικά δικαιώματα εμφανίζονται για αγορά ή δανεισμό.</p>`;
  dlg.showModal();
};
let deferred = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#installBtn').hidden = false; });
$('#installBtn').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#installBtn').hidden = true; };
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
setMode('books');
