/**
 * The public Hero Animation Library.  Metadata stays small so the Homepage
 * can render its controls without loading any alternate SVG scene.
 *
 * The actual scenes are loaded on the first visitor interaction from a
 * separate client chunk (hero-animation-variants.js).  This keeps the
 * original Solar Wind illustration as the zero-JavaScript fallback.
 */
export const HERO_ANIMATIONS = [
  {
    id: 'solar-wind',
    label: 'Solar wind',
    shortLabel: 'Wind',
    description: 'Solar wind particles crossing a planetary magnetic field.',
  },
  {
    id: 'solar-corona',
    label: 'Solar corona',
    shortLabel: 'Corona',
    description: 'Coronal loops and plasma rising above the solar surface.',
  },
  {
    id: 'solar-flare',
    label: 'Solar flare',
    shortLabel: 'Flare',
    description: 'A compact flare and the magnetic energy released around it.',
  },
  {
    id: 'cme',
    label: 'Coronal mass ejection',
    shortLabel: 'CME',
    description: 'A coronal mass ejection travelling out from the Sun.',
  },
  {
    id: 'magnetic-reconnection',
    label: 'Magnetic reconnection',
    shortLabel: 'Reconnection',
    description: 'Opposing field lines reconnect and release stored energy.',
  },
  {
    id: 'radiation-belt',
    label: 'Earth radiation belt',
    shortLabel: 'Radiation belt',
    description: 'Charged particles trapped by the Van Allen belts.',
  },
  {
    id: 'polarization',
    label: 'Polarization and Stokes',
    shortLabel: 'Polarization',
    description: 'A field direction and the Q, U, V measurements it encodes.',
  },
  {
    id: 'plasma-waves',
    label: 'Plasma waves',
    shortLabel: 'Plasma waves',
    description: 'A propagating wave packet in a magnetized plasma.',
  },
  {
    id: 'observation-pipeline',
    label: 'Solar observation pipeline',
    shortLabel: 'Pipeline',
    description: 'Telescope, raw data, processing, and a scientific image.',
  },
  {
    id: 'research-workflow',
    label: 'Research workflow',
    shortLabel: 'Workflow',
    description: 'Observation becomes data, code, analysis, and knowledge.',
  },
];

export const DEFAULT_HERO_ANIMATION = 'solar-wind';

