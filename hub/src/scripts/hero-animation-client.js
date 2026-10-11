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

  const optionLabel = (id) => options.find((option) => option.dataset.animationId === id)?.textContent?.trim() || id;
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
    status.textContent = id === 'solar-wind' || !isMobile
      ? `${optionLabel(id)} selected. Click another label to explore.`
      : `${optionLabel(id)} selected. A static Solar Wind illustration is shown on small screens.`;
  };
  const loadRenderer = async () => {
    if (!loading) loading = import('./hero-animation-variants.js').then((module) => { renderScene = module.renderHeroAnimation; return renderScene; });
    return loading;
  };
  const choose = async (id) => {
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
      renderer?.(id, dynamic, { reducedMotion: prefersReducedMotion() });
    } catch (error) {
      // The base illustration remains useful if an optional scene chunk fails.
      console.warn('Hero animation scene unavailable', error);
      if (status) status.textContent = `${optionLabel(id)} is unavailable; showing Solar Wind.`;
      setSelected('solar-wind');
      showFallback('solar-wind');
    }
  };

  for (const option of options) option.addEventListener('click', () => choose(option.dataset.animationId));
  choose(defaultOption);
  window.addEventListener('resize', () => {
    const selectedId = options.find((option) => option.getAttribute('aria-pressed') === 'true')?.dataset.animationId || 'solar-wind';
    showFallback(selectedId);
    updateStatus(selectedId);
  }, { passive: true });
}

