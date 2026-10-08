const LABEL = /^[A-Za-z][A-Za-z0-9:._-]{0,119}$/;
const ENVIRONMENTS = new Set(['definition', 'theorem', 'lemma', 'proposition', 'corollary', 'proof', 'example', 'remark', 'note', 'warning', 'exercise', 'solution']);
const UNNUMBERED = new Set(['proof', 'remark', 'note', 'warning', 'solution']);
const text = value => ({ type: 'text', value });
const plain = node => node.value ?? (node.children || []).map(plain).join('');
const capital = value => value[0].toUpperCase() + value.slice(1);

function setElement(node, name, properties = {}) {
  node.data = { ...node.data, hName: name, hProperties: { ...node.data?.hProperties, ...properties } };
  return node;
}

// This is an AST-only extension. It never accepts or creates executable HTML/MDX.
export default function remarkAcademic(options = {}) {
  return (tree, file) => {
    const labels = new Map(), ids = new Set(), counters = new Map(), headings = [0, 0, 0, 0, 0, 0];
    const fail = (message, node) => file.fail(message, node);
    const next = kind => { const n = (counters.get(kind) || 0) + 1; counters.set(kind, n); return options.numberPrefix ? `${options.numberPrefix}.${n}` : String(n); };
    function register(label, value, node, explicitId) {
      if (!LABEL.test(label)) fail(`Invalid academic label "${label}". Use letters, numbers, colon, dot, underscore or hyphen.`, node);
      const id = explicitId || `academic-${label}`;
      if (labels.has(label) || ids.has(id)) fail(`Duplicate academic label "${label}".`, node);
      labels.set(label, { id, value }); ids.add(id); return id;
    }
    function trailingLabel(node) {
      const tail = node.children?.at(-1);
      if (tail?.type !== 'text') return null;
      const match = tail.value.match(/\s*\{#([^{}\s]+)\}\s*$/);
      if (!match) return null;
      tail.value = tail.value.slice(0, match.index).trimEnd();
      if (!tail.value) node.children.pop();
      return match[1];
    }
    function scan(parent) {
      for (let index = 0; index < (parent.children || []).length; index++) {
        const node = parent.children[index];
        if (['code', 'inlineCode', 'html', 'mdxjsEsm', 'mdxFlowExpression', 'mdxTextExpression'].includes(node.type)) continue;
        if (node.type === 'heading') {
          headings[node.depth - 1]++; headings.fill(0, node.depth);
          const label = trailingLabel(node);
          if (label) setElement(node, `h${node.depth}`, { id: register(label, headings.slice(0, node.depth).filter(Boolean).join('.'), node, label) });
        }
        if (node.type === 'blockquote' && node.children[0]?.type === 'paragraph') {
          const titleNode = node.children[0], first = titleNode.children[0], marker = first?.type === 'text' && first.value.match(/^\[!([A-Za-z]+)\]\s*/);
          const kind = marker && marker[1].toLowerCase();
          if (ENVIRONMENTS.has(kind)) {
            first.value = first.value.slice(marker[0].length);
            const label = trailingLabel(titleNode), number = UNNUMBERED.has(kind) ? '' : next(kind);
            const title = `${capital(kind)}${number ? ` ${number}` : ''}`;
            const id = label ? register(label, number || capital(kind), node) : undefined;
            if (plain(titleNode).trim()) titleNode.children.unshift(text(`${title} — `)); else titleNode.children = [text(title)];
            setElement(titleNode, 'p', { className: ['academic-environment-title'] });
            setElement(node, 'aside', { className: ['academic-environment', `academic-${kind}`], 'data-academic-kind': kind, ...(id ? { id } : {}) });
            if (kind === 'proof') node.children.push(setElement({ type: 'paragraph', children: [text('□')] }, 'p', { className: ['academic-qed'], ariaLabel: 'End of proof' }));
          }
        }
        if (node.type === 'math') {
          const found = [...node.value.matchAll(/\\label\{([^{}]+)\}/g)];
          if (found.length > 1) fail('A displayed equation can have only one label.', node);
          const begin = node.value.match(/^\s*\\begin\{equation(\*?)\}([\s\S]*)\\end\{equation\1\}\s*$/);
          if (begin) node.value = begin[2].trim();
          if (found.length) {
            const label = found[0][1], manual = node.value.match(/\\tag\*?\{([^{}]+)\}/), number = manual?.[1] || next('equation');
            const id = register(label, number, node);
            node.value = node.value.replace(/\\label\{[^{}]+\}/g, '').trim();
            if (!manual) node.value += ` \\tag{${number}}`;
            const wrapper = setElement({ type: 'paragraph', children: [node] }, 'div', { className: ['academic-equation'], id });
            parent.children[index] = wrapper;
          }
        }
        if (node.type === 'paragraph' && node.children.length === 1 && node.children[0].type === 'image') {
          const caption = parent.children[index + 1];
          if (caption?.type === 'paragraph' && /^Figure:\s*/i.test(plain(caption))) {
            const label = trailingLabel(caption), number = next('figure'), id = label ? register(label, number, node) : undefined;
            const first = caption.children[0];
            if (first?.type !== 'text') fail('Start a figure caption with plain "Figure: ".', caption);
            first.value = first.value.replace(/^Figure:\s*/i, `Figure ${number}. `);
            setElement(caption, 'figcaption', { className: ['academic-figure-caption'] });
            setElement(node, 'figure', { className: ['academic-figure'], ...(id ? { id } : {}) });
            node.children.push(caption); parent.children.splice(index + 1, 1);
          }
        }
        // A math node wrapped above is already scanned; do not count its label twice.
        if (node.type !== 'math') scan(node);
      }
    }
    scan(tree);
    function references(parent, insideLink = false) {
      if (['code', 'inlineCode', 'html', 'mdxjsEsm', 'mdxFlowExpression', 'mdxTextExpression'].includes(parent.type)) return;
      if (['math', 'inlineMath'].includes(parent.type)) {
        parent.value = parent.value.replace(/\\(eqref|ref)\{([^{}]+)\}/g, (_all, kind, label) => {
          const found = labels.get(label); if (!found) fail(`Missing academic label "${label}".`, parent);
          return `\\text{${kind === 'eqref' ? `(${found.value})` : found.value}}`;
        });
        // remark-math creates the HAST children during parsing, before we clean TeX.
        const code = parent.type === 'math' ? parent.data?.hChildren?.[0] : parent.data;
        if (parent.type === 'math' && code?.children) code.children = [{ type: 'text', value: parent.value }];
        if (parent.type === 'inlineMath' && parent.data?.hChildren) parent.data.hChildren = [{ type: 'text', value: parent.value }];
        return;
      }
      for (let i = 0; i < (parent.children || []).length; i++) {
        const node = parent.children[i];
        if (node.type === 'text' && !insideLink) {
          const pieces = []; let end = 0;
          for (const match of node.value.matchAll(/\\(eqref|ref)\{([^{}]+)\}/g)) {
            const found = labels.get(match[2]); if (!found) fail(`Missing academic label "${match[2]}".`, node);
            if (match.index > end) pieces.push(text(node.value.slice(end, match.index)));
            pieces.push({ type: 'link', url: `#${found.id}`, children: [text(match[1] === 'eqref' ? `(${found.value})` : found.value)], data: { hProperties: { className: ['academic-reference'], 'data-academic-reference': match[2] } } });
            end = match.index + match[0].length;
          }
          if (pieces.length) { if (end < node.value.length) pieces.push(text(node.value.slice(end))); parent.children.splice(i, 1, ...pieces); i += pieces.length - 1; }
        } else references(node, insideLink || node.type === 'link' || node.type === 'linkReference');
      }
    }
    references(tree);
    file.data.academicLabels = Object.fromEntries(labels);
  };
}
