(function () {
  'use strict';

  const API = 'https://countapi.mileshilliard.com/api/v1';
  const PREFIX = 'kimh6ram-20260921-';
  const project = (window.SITE_ANALYTICS_PROJECT || 'ccojik')
    .toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  const prefix = PREFIX + project;

  function hit(eventName) {
    const key = (prefix + '-' + eventName).replace(/[^a-z0-9_-]+/g, '-');
    return fetch(API + '/hit/' + encodeURIComponent(key), {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      keepalive: true
    }).catch(function () {});
  }

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (_) {}
  }

  function dayKey() {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0')
    ].join('-');
  }

  hit('page_view');

  const everKey = '__kh_analytics_ever_' + project;
  if (!safeGet(everKey)) {
    safeSet(everKey, '1');
    hit('unique_visitor');
  }

  const today = dayKey();
  const dailyKey = '__kh_analytics_daily_' + project;
  if (safeGet(dailyKey) !== today) {
    safeSet(dailyKey, today);
    hit('daily_unique_' + today.replace(/-/g, '_'));
  }

  const trackedVisible = new WeakMap();
  function visible(el) {
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
  }

  function checkResultScreens() {
    const selectors = [
      '#resultScreen', '#screen-result', '#result-screen',
      '.result-screen', '.screen.result', '.result-panel'
    ];
    const nodes = document.querySelectorAll(selectors.join(','));
    nodes.forEach(function (el) {
      const isVisible = visible(el);
      const wasVisible = trackedVisible.get(el) === true;
      if (isVisible && !wasVisible) hit('game_complete');
      trackedVisible.set(el, isVisible);
    });
  }

  function classifyClick(target) {
    const el = target && target.closest
      ? target.closest('button, a, [role="button"], input[type="button"], input[type="submit"]')
      : null;
    if (!el) return;

    const text = [
      el.id || '',
      typeof el.className === 'string' ? el.className : '',
      el.textContent || '',
      el.getAttribute('aria-label') || ''
    ].join(' ').toLowerCase();

    if (/(게임\s*시작|도전\s*시작|시작하기|startbtn|btn-start|\bstart\b)/i.test(text)) hit('game_start');
    if (/(다시\s*하기|다시하기|한\s*번\s*더|다시\s*도전|retry|replay|again)/i.test(text)) hit('replay');
    if (/(공유|도전장|친구에게|친구한테|share)/i.test(text)) hit('share');
    if (/(저장|save|download)/i.test(text)) hit('save_result');
    if (/(완성|제출|finish|complete|donebtn|btn-done)/i.test(text)) hit('game_complete');
  }

  document.addEventListener('click', function (e) {
    classifyClick(e.target);
    setTimeout(checkResultScreens, 0);
  }, true);

  const observer = new MutationObserver(function () {
    checkResultScreens();
  });

  function startObserver() {
    if (!document.body) return;
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden']
    });
    checkResultScreens();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }

  window.SiteAnalytics = {
    project: project,
    track: function (eventName) {
      if (!eventName) return Promise.resolve();
      return hit(String(eventName).toLowerCase().replace(/[^a-z0-9_-]+/g, '-'));
    }
  };
})();