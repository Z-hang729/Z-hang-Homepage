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
    label: 'Solar wind', labelZh: '太阳风',
    shortLabel: 'Wind', shortLabelZh: '太阳风',
    description: 'Solar wind particles crossing a planetary magnetic field.', descriptionZh: '太阳风粒子穿过行星磁场。',
  },
  {
    id: 'solar-corona',
    label: 'Solar corona', labelZh: '太阳日冕',
    shortLabel: 'Corona', shortLabelZh: '日冕',
    description: 'Coronal loops and plasma rising above the solar surface.', descriptionZh: '日冕环与等离子体从太阳表面升起。',
  },
  {
    id: 'solar-flare',
    label: 'Solar flare', labelZh: '太阳耀斑',
    shortLabel: 'Flare', shortLabelZh: '耀斑',
    description: 'A compact flare and the magnetic energy released around it.', descriptionZh: '紧凑耀斑及其周围释放的磁能。',
  },
  {
    id: 'cme',
    label: 'Coronal mass ejection', labelZh: '日冕物质抛射',
    shortLabel: 'CME', shortLabelZh: 'CME',
    description: 'A coronal mass ejection travelling out from the Sun.', descriptionZh: '日冕物质抛射从太阳向外传播。',
  },
  {
    id: 'magnetic-reconnection',
    label: 'Magnetic reconnection', labelZh: '磁重联',
    shortLabel: 'Reconnection', shortLabelZh: '磁重联',
    description: 'Opposing field lines reconnect and release stored energy.', descriptionZh: '相反方向的磁力线重新连接并释放储存的能量。',
  },
  {
    id: 'radiation-belt',
    label: 'Earth radiation belt', labelZh: '地球辐射带',
    shortLabel: 'Radiation belt', shortLabelZh: '辐射带',
    description: 'Charged particles trapped by the Van Allen belts.', descriptionZh: '带电粒子被 Van Allen 辐射带俘获。',
  },
  {
    id: 'polarization',
    label: 'Polarization and Stokes', labelZh: '偏振与 Stokes 参数',
    shortLabel: 'Polarization', shortLabelZh: '偏振',
    description: 'A field direction and the Q, U, V measurements it encodes.', descriptionZh: '磁场方向以及其中包含的 Q、U、V 测量量。',
  },
  {
    id: 'plasma-waves',
    label: 'Plasma waves', labelZh: '等离子体波',
    shortLabel: 'Plasma waves', shortLabelZh: '等离子体波',
    description: 'A propagating wave packet in a magnetized plasma.', descriptionZh: '磁化等离子体中的传播波包。',
  },
  {
    id: 'observation-pipeline',
    label: 'Solar observation pipeline', labelZh: '太阳观测流程',
    shortLabel: 'Pipeline', shortLabelZh: '观测流程',
    description: 'Telescope, raw data, processing, and a scientific image.', descriptionZh: '望远镜、原始数据、处理步骤与科学图像。',
  },
  {
    id: 'research-workflow',
    label: 'Research workflow', labelZh: '研究流程',
    shortLabel: 'Workflow', shortLabelZh: '研究流程',
    description: 'Observation becomes data, code, analysis, and knowledge.', descriptionZh: '观测逐步转化为数据、代码、分析与知识。',
  },
];

export const DEFAULT_HERO_ANIMATION = 'solar-wind';

