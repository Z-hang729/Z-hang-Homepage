import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import remarkBase from '../scripts/remark-base.mjs';

test('rendered Markdown keeps direct and reference links inside the deployment path', async t => {
  const previous = process.env.SITE_BASE_PATH;
  t.after(() => {
    if (previous === undefined) delete process.env.SITE_BASE_PATH;
    else process.env.SITE_BASE_PATH = previous;
  });
  for (const base of ['/', '/Z-hang-Homepage/']) {
    process.env.SITE_BASE_PATH = base;
    const prefix = base === '/' ? '' : base.slice(0, -1);
    const renderer = await createMarkdownProcessor({ remarkPlugins: [remarkBase], syntaxHighlight: false });
    const { code } = await renderer.render([
      '[Note](/notes/course/)',
      '![Direct plot](/uploads/plot.png)',
      '[Chinese PDF][paper]',
      '![Reference plot][plot]',
      `[Already prefixed](${prefix}/projects/)`,
      '[External](https://example.org/paper)',
      '[Heading](#method)',
      '',
      '[paper]: </uploads/%E9%98%85%E8%AF%BB%20%E6%9D%90%E6%96%99.pdf> "Reading materials"',
      '[plot]: /uploads/reference.png',
    ].join('\n\n'));
    assert.ok(code.includes(`href="${prefix}/notes/course/"`));
    assert.ok(code.includes(`src="${prefix}/uploads/plot.png"`));
    assert.ok(code.includes(`href="${prefix}/uploads/%E9%98%85%E8%AF%BB%20%E6%9D%90%E6%96%99.pdf"`));
    assert.ok(code.includes(`src="${prefix}/uploads/reference.png"`));
    assert.ok(code.includes(`href="${prefix}/projects/"`));
    assert.ok(code.includes('href="https://example.org/paper"'));
    assert.ok(code.includes('href="#method"'));
    assert.ok(!code.includes('/Z-hang-Homepage/Z-hang-Homepage/'));
  }
});
