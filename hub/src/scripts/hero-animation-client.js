const roots = document.querySelectorAll('[data-hero-animation]');

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

for (const root of roots) {
  const stage = root.querySelector('[data-hero-animation-stage]');
  const dynamic = root.querySelector('[data-hero-animation-dynamic]');
  const status = root.querySelector('[data-hero-animation-status]');
  const options = [...root.querySelectorAll('[data-animation-id]')];
  const defaultOption = root.dataset.defaultAnimation || 'solar-wind';
  let renderScene;
  let loading;
  let selectionToken = 0;

  const isChinese = () => document.documentElement.dataset.language === 'zh-CN';
  const optionLabel = (id) => {
    const option = options.find((item) => item.dataset.animationId === id);
    return option ? ((isChinese() ? option.dataset.labelZh : option.dataset.labelEn) || option.textContent?.trim() || id) : id;
  };
  const optionDescription = (id) => {
    const option = options.find((item) => item.dataset.animationId === id);
    return option ? ((isChinese() ? option.dataset.descriptionZh : option.dataset.descriptionEn) || '') : '';
  };
  const updateOptionLabels = () => options.forEach((option) => {
    const label = option.querySelector('[data-animation-label]');
    if (label) label.textContent = (isChinese() ? option.dataset.labelZh : option.dataset.labelEn) || label.textContent || '';
    option.setAttribute('aria-label', `${optionLabel(option.dataset.animationId || '')}: ${optionDescription(option.dataset.animationId || '')}`);
    option.setAttribute('title', optionDescription(option.dataset.animationId || ''));
  });
  const setSelected = (id) => {
    for (const option of options) option.setAttribute('aria-pressed', String(option.dataset.animationId === id));
  };
  const showFallback = (id) => {
    if (stage) stage.classList.toggle('is-dynamic', id !== 'solar-wind');
    if (dynamic) {
      dynamic.hidden = id === 'solar-wind' || window.matchMedia?.('(max-width: 720px)').matches;
      dynamic.setAttribute('aria-hidden', String(dynamic.hidden));
    }
  };
  const updateStatus = (id) => {
    if (!status) return;
    const isMobile = window.matchMedia?.('(max-width: 720px)').matches;
    status.textContent = isChinese()
      ? (id === 'solar-wind' || !isMobile ? `${optionLabel(id)}已选中。点击其他标签继续探索。` : `${optionLabel(id)}已选中。小屏幕显示静态太阳风插图。`)
      : (id === 'solar-wind' || !isMobile ? `${optionLabel(id)} selected. Click another label to explore.` : `${optionLabel(id)} selected. A static Solar Wind illustration is shown on small screens.`);
  };
  const loadRenderer = async () => {
    if (!loading) loading = import('./hero-animation-variants.js').then((module) => { renderScene = module.renderHeroAnimation; return renderScene; });
    return loading;
  };
  const choose = async (id) => {
    const token = ++selectionToken;
    if (!id || id === 'solar-wind') {
      setSelected('solar-wind');
      showFallback('solar-wind');
      updateStatus('solar-wind');
      return;
    }
    setSelected(id);
    updateStatus(id);
    showFallback(id);
    if (!dynamic || dynamic.hidden) return;
    try {
      const renderer = await loadRenderer();
      if (token !== selectionToken) return;
      renderer?.(id, dynamic, { reducedMotion: prefersReducedMotion() });
    } catch (error) {
      if (token !== selectionToken) return;
      // The base illustration remains useful if an optional scene chunk fails.
      console.warn('Hero animation scene unavailable', error);
      if (status) status.textContent = isChinese() ? `${optionLabel(id)}暂不可用，正在显示太阳风。` : `${optionLabel(id)} is unavailable; showing Solar Wind.`;
      setSelected('solar-wind');
      showFallback('solar-wind');
    }
  };

  for (const option of options) option.addEventListener('click', () => choose(option.dataset.animationId));
  updateOptionLabels();
  document.addEventListener('zh-language-change', () => {
    updateOptionLabels();
    updateStatus(options.find((option) => option.getAttribute('aria-pressed') === 'true')?.dataset.animationId || 'solar-wind');
  });
  choose(defaultOption);
  window.addEventListener('resize', () => {
    const selectedId = options.find((option) => option.getAttribute('aria-pressed') === 'true')?.dataset.animationId || 'solar-wind';
    showFallback(selectedId);
    updateStatus(selectedId);
    if (selectedId !== 'solar-wind' && dynamic && !dynamic.hidden && !dynamic.innerHTML.trim()) choose(selectedId);
  }, { passive: true });
}

