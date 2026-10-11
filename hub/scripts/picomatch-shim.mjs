// Vite 8's module runner can evaluate the transitive CommonJS picomatch
// package as inline ESM during Astro content sync. Loading it through Node's
// native CommonJS bridge keeps the matcher semantics while avoiding that
// runner edge case on Windows.
import { createRequire } from 'node:module';

const picomatch = createRequire(import.meta.url)('picomatch');

export default picomatch;
export const makeRe = picomatch.makeRe;
export const parse = picomatch.parse;
export const scan = picomatch.scan;
export const test = picomatch.test;
export const isMatch = picomatch.isMatch;
