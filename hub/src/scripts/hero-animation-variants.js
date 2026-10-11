const sceneFrame = (id, title, description, content) => `
  <svg class="hero-animation-scene" viewBox="0 0 640 470" role="img" aria-labelledby="${id}-title ${id}-description">
    <title id="${id}-title">${title}</title>
    <desc id="${id}-description">${description}</desc>
    <defs>
      <pattern id="${id}-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" stroke="currentColor" opacity=".045" fill="none"/></pattern>
      <radialGradient id="${id}-glow"><stop stop-color="#efa36c" stop-opacity=".28"/><stop offset="1" stop-color="#efa36c" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="640" height="470" fill="url(#${id}-grid)"/>
    ${content}
    <text x="32" y="440" class="scene-caption">CONCEPTUAL FIELD STUDY · NOT TO SCALE</text>
  </svg>`;

const scenes = {
  'solar-corona': () => sceneFrame(
    'solar-corona',
    'Solar corona',
    'Coronal loops and plasma rising above the surface of the Sun.',
    `<circle cx="140" cy="270" r="76" fill="url(#solar-corona-glow)"/><circle cx="140" cy="270" r="42" class="scene-solar"/>
      <g class="scene-field scene-animated"><path d="M105 262C45 150 210 100 250 268C210 430 45 385 105 278"/><path d="M122 249C93 175 190 160 214 267C190 370 93 350 122 286"/><path d="M153 235C140 190 180 185 190 268C180 345 140 340 153 298"/></g>
      <g class="scene-accent scene-animated"><circle cx="220" cy="120" r="3"/><circle cx="252" cy="165" r="2"/><circle cx="269" cy="226" r="2"/><circle cx="234" cy="335" r="3"/></g>
      <text x="96" y="366" class="scene-label">SOLAR SURFACE</text><text x="322" y="78" class="scene-label">CORONAL LOOPS</text>`),
  'solar-flare': () => sceneFrame(
    'solar-flare',
    'Solar flare',
    'A compact flare releases magnetic energy above the solar surface.',
    `<circle cx="142" cy="284" r="84" fill="url(#solar-flare-glow)"/><circle cx="142" cy="284" r="48" class="scene-solar"/>
      <g class="scene-field"><path d="M118 252C88 176 221 170 247 276C224 378 93 363 118 302"/><path d="M153 247C152 200 220 206 220 279C214 342 155 346 153 310"/></g>
      <g class="scene-flare-burst scene-animated"><path d="M232 280L410 104M244 286L457 286M230 295L400 401M218 270L283 95"/><circle cx="232" cy="285" r="18"/></g>
      <path d="M294 158L382 286L294 373" class="scene-reconnection"/><text x="300" y="79" class="scene-label">ENERGY RELEASE</text><text x="83" y="383" class="scene-label">ACTIVE REGION</text>`),
  cme: () => sceneFrame(
    'cme',
    'Coronal mass ejection',
    'A coronal mass ejection leaves the Sun and expands into space.',
    `<circle cx="94" cy="274" r="54" fill="url(#cme-glow)"/><circle cx="94" cy="274" r="33" class="scene-solar"/>
      <path d="M126 274C187 169 248 176 302 274C355 371 422 375 500 267" class="scene-field"/>
      <g class="scene-cme-cloud scene-animated"><path d="M144 222C174 168 225 172 248 207C282 169 341 185 347 232C391 221 426 254 414 292C389 339 295 341 230 318C168 314 124 275 144 222Z"/><circle cx="225" cy="244" r="10"/><circle cx="278" cy="221" r="13"/><circle cx="326" cy="265" r="9"/></g>
      <path d="M446 168v-28m-11 14h22M507 329v-28m-11 14h22" class="scene-accent"/><text x="425" y="105" class="scene-label">OUTFLOW</text><text x="45" y="385" class="scene-label">CORONA</text>`),
  'magnetic-reconnection': () => sceneFrame(
    'magnetic-reconnection',
    'Magnetic reconnection',
    'Opposing magnetic field lines reconnect and release stored energy.',
    `<g class="scene-field"><path d="M62 100C178 120 251 189 320 235C389 281 461 350 578 370"/><path d="M62 370C178 350 251 281 320 235C389 189 461 120 578 100"/><path d="M62 154C189 158 253 204 320 235C387 266 451 312 578 316"/><path d="M62 316C189 312 253 266 320 235C387 204 451 158 578 154"/></g>
      <g class="scene-reconnection scene-animated"><circle cx="320" cy="235" r="22"/><path d="M305 214l30 42m0-42-30 42"/></g>
      <g class="scene-accent"><path d="M320 190v-45m0 335v-45M275 235h-45m180 0h-45"/><circle cx="320" cy="126" r="4"/><circle cx="320" cy="344" r="4"/></g>
      <text x="276" y="90" class="scene-label">RELEASE</text><text x="39" y="426" class="scene-label">OPPOSING FIELDS</text>`),
  'radiation-belt': () => sceneFrame(
    'radiation-belt',
    'Earth radiation belt',
    'Charged particles follow the Van Allen belts around Earth.',
    `<ellipse cx="320" cy="235" rx="210" ry="130" class="scene-field"/><ellipse cx="320" cy="235" rx="153" ry="91" class="scene-field"/><circle cx="320" cy="235" r="39" class="scene-earth"/>
      <g class="scene-particles scene-animated"><circle cx="140" cy="209" r="4"/><circle cx="177" cy="138" r="3"/><circle cx="458" cy="177" r="4"/><circle cx="487" cy="274" r="3"/><circle cx="189" cy="334" r="3"/><circle cx="420" cy="342" r="4"/></g>
      <path d="M320 182v106M267 235h106" class="scene-earth-axis"/><text x="251" y="80" class="scene-label">VAN ALLEN BELTS</text><text x="292" y="319" class="scene-label">EARTH</text>`),
  polarization: () => sceneFrame(
    'polarization',
    'Polarization and Stokes parameters',
    'Polarization direction and Q, U, V measurements in a scientific observation.',
    `<circle cx="155" cy="235" r="88" class="scene-polarization-ring"/><circle cx="155" cy="235" r="58" class="scene-polarization-ring"/><path d="M62 235h186M155 142v186" class="scene-grid-line"/>
      <g class="scene-polarization scene-animated"><path d="M91 298L219 172"/><path d="M94 171L216 299"/><circle cx="155" cy="235" r="28"/></g>
      <g class="scene-metric"><text x="340" y="180">Q</text><text x="340" y="245">U</text><text x="340" y="310">V</text><path d="M376 174h174M376 239h174M376 304h174"/></g>
      <text x="82" y="381" class="scene-label">POLARIZATION ANGLE</text><text x="340" y="118" class="scene-label">STOKES PARAMETERS</text>`),
  'plasma-waves': () => sceneFrame(
    'plasma-waves',
    'Plasma waves',
    'A propagating wave packet in a magnetized space plasma.',
    `<path d="M54 235H586" class="scene-grid-line"/><path d="M54 160H586M54 310H586" class="scene-grid-line"/>
      <path d="M54 235C92 128 130 342 168 235S244 128 282 235S358 342 396 235S472 128 510 235S548 342 586 235" class="scene-wave scene-animated"/>
      <path d="M54 235C92 198 130 272 168 235S244 198 282 235S358 272 396 235S472 198 510 235S548 272 586 235" class="scene-wave-secondary"/>
      <circle cx="282" cy="235" r="7" class="scene-accent"/><path d="M282 235v-86" class="scene-accent"/><text x="53" y="97" class="scene-label">FIELD PERTURBATION</text><text x="490" y="385" class="scene-label">TIME →</text>`),
  'observation-pipeline': () => sceneFrame(
    'observation-pipeline',
    'Solar observation pipeline',
    'A solar telescope produces raw data that is processed into a scientific image.',
    `<g class="scene-pipeline"><rect x="36" y="190" width="120" height="82"/><rect x="190" y="190" width="120" height="82"/><rect x="344" y="190" width="120" height="82"/><rect x="498" y="190" width="106" height="82"/></g>
      <g class="scene-pipeline-arrows scene-animated"><path d="M158 231h26m-8-8 8 8-8 8M312 231h26m-8-8 8 8-8 8M466 231h26m-8-8 8 8-8 8"/></g>
      <g class="scene-pipeline-labels"><text x="61" y="224">TELESCOPE</text><text x="215" y="224">RAW DATA</text><text x="361" y="224">PROCESSING</text><text x="513" y="224">IMAGE</text></g>
      <path d="M70 144h64m-8-6 8 6-8 6M224 144h64m-8-6 8 6-8 6M378 144h64m-8-6 8 6-8 6" class="scene-accent"/><text x="42" y="339" class="scene-label">SPACE PHYSICS × COMPUTER SCIENCE</text>`),
  'research-workflow': () => sceneFrame(
    'research-workflow',
    'Research workflow',
    'Observation becomes data, code, analysis, and shared scientific knowledge.',
    `<g class="scene-workflow"><rect x="38" y="192" width="100" height="84"/><rect x="164" y="192" width="100" height="84"/><rect x="290" y="192" width="100" height="84"/><rect x="416" y="192" width="100" height="84"/></g>
      <g class="scene-workflow-labels"><text x="58" y="226">OBSERVE</text><text x="193" y="226">DATA</text><text x="306" y="226">CODE</text><text x="436" y="226">ANALYZE</text></g>
      <path d="M138 234h26m-8-8 8 8-8 8M264 234h26m-8-8 8 8-8 8M390 234h26m-8-8 8 8-8 8" class="scene-accent scene-animated"/>
      <path d="M466 302C389 381 233 381 138 302" class="scene-field"/><circle cx="320" cy="366" r="31" class="scene-knowledge"/><text x="292" y="372" class="scene-label">KNOWLEDGE</text><text x="38" y="97" class="scene-label">REPRODUCIBLE PRACTICE</text>`),
};

export function renderHeroAnimation(id, target, { reducedMotion = false } = {}) {
  const render = scenes[id];
  if (!render || !target) return false;
  target.innerHTML = render();
  target.classList.toggle('reduced-motion', reducedMotion);
  return true;
}

