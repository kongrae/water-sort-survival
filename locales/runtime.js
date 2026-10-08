// Embedded into the standalone game by scripts/embed-i18n.js. Translations need no network request.
window.WSSLocale = (() => {
  const catalog = __CATALOG__;
  const languages = [
    ['ko', '한국어'], ['en', 'English'], ['ja', '日本語'],
    ['zh-Hans', '简体中文'], ['zh-Hant', '繁體中文'],
    ['es', 'Español'], ['pt-BR', 'Português (Brasil)'],
    ['hi', 'हिन्दी'], ['id', 'Bahasa Indonesia'],
  ];
  const columns = languages.slice(1).map(([code]) => code);
  function normalize(value) {
    const code = String(value || '').replace(/_/g, '-').toLowerCase();
    if (/^zh(?:-|$)/.test(code)) {
      if (/(?:^|-)hant(?:-|$)/.test(code)) return 'zh-Hant';
      if (/(?:^|-)hans(?:-|$)/.test(code)) return 'zh-Hans';
      return /(?:^|-)(tw|hk|mo)(?:-|$)/.test(code) ? 'zh-Hant' : 'zh-Hans';
    }
    if (/^pt(?:-|$)/.test(code)) return 'pt-BR';
    if (/^in(?:-|$)/.test(code)) return 'id';
    return languages.find(([lang]) => lang.toLowerCase() === code.split('-')[0])?.[0] || null;
  }
  const detect = values => { for (const value of values) { const code = normalize(value); if (code) return code; } return 'en'; };
  let choice;
  try { choice = JSON.parse(localStorage.getItem('wsurv.locale')); } catch (_) {}
  if (choice !== 'auto' && !languages.some(([code]) => code === choice)) choice = 'auto';
  const requested = normalize(new URLSearchParams(location.search).get('lang'));
  let locale = requested || (choice === 'auto' ? detect(navigator.languages || [navigator.language]) : choice);
  const t = (key, ...values) => {
    const row = catalog[key];
    const template = locale === 'ko' ? key : row?.[columns.indexOf(locale)] ?? row?.[0] ?? key;
    return template.replace(/\{(\d+)\}/g, (_, index) => String(values[index] ?? ''));
  };
  // Keep original text nodes so changing language preserves markup and event listeners.
  const textNodes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode, key = node.nodeValue.trim();
    if (catalog[key] && !node.parentElement.closest('script, style, textarea, #optLanguage')) textNodes.push([node, node.nodeValue, key]);
  }
  const attributes = [];
  for (const element of document.querySelectorAll('[aria-label], [title]')) {
    for (const attr of ['aria-label', 'title']) {
      const key = element.getAttribute(attr);
      if (key && catalog[key]) attributes.push([element, attr, key]);
    }
  }
  const title = document.title;
  const description = document.querySelector('meta[name="description"]');
  const descriptionText = description?.content;
  function apply() {
    document.documentElement.lang = locale;
    document.documentElement.dir = 'ltr';
    document.title = t(title);
    if (description) description.content = t(descriptionText);
    for (const [node, original, key] of textNodes) if (node.isConnected) node.nodeValue = original.replace(key, t(key));
    for (const [element, attr, key] of attributes) if (element.isConnected) element.setAttribute(attr, t(key));
    const select = document.getElementById('optLanguage');
    if (select) {
      select.replaceChildren(new Option(t('자동 (브라우저 언어)'), 'auto'), ...languages.map(([code, label]) => new Option(label, code)));
      select.value = choice;
    }
  }
  function set(value) {
    choice = languages.some(([code]) => code === value) ? value : 'auto';
    try { localStorage.setItem('wsurv.locale', JSON.stringify(choice)); } catch (_) {}
    locale = choice === 'auto' ? detect(navigator.languages || [navigator.language]) : choice;
    const url = new URL(location.href);
    if (url.searchParams.has('lang')) { url.searchParams.delete('lang'); history.replaceState(null, '', url); }
    apply();
    window.dispatchEvent(new Event('wss:localechange'));
  }
  apply();
  return { t, set, apply, current: () => locale, choice: () => choice, languages, normalize, detect };
})();
