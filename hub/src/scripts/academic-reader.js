// Generated Markdown figures use the same original bytes in the reader and dialog.
export function installAcademicFigures(root = document) {
  for (const figure of root.querySelectorAll('.academic-figure:not([data-figure])')) {
    const image = figure.querySelector('img');
    if (!image || figure.dataset.academicFigureInstalled) continue;
    figure.dataset.academicFigureInstalled = 'true';
    const doc = figure.ownerDocument, source = image.getAttribute('src');
    if (!source) continue;
    image.loading = 'lazy'; image.decoding = 'async';
    const imageButton = doc.createElement('button');
    imageButton.type = 'button'; imageButton.className = 'academic-figure-image';
    imageButton.setAttribute('aria-label', 'Enlarge figure: ' + (image.alt || 'Image'));
    image.replaceWith(imageButton); imageButton.append(image);
    const actions = doc.createElement('div'); actions.className = 'academic-figure-actions';
    const enlarge = doc.createElement('button'); enlarge.type = 'button'; enlarge.textContent = 'Enlarge ↗';
    const download = doc.createElement('a'); download.href = source; download.download = ''; download.textContent = 'Download Original ↓';
    download.rel = 'noopener noreferrer';
    actions.append(enlarge, download); figure.append(actions);
    const dialog = doc.createElement('dialog'); dialog.className = 'academic-figure-dialog';
    dialog.setAttribute('aria-label', 'Enlarged figure: ' + (image.alt || 'Image'));
    const close = doc.createElement('button'); close.type = 'button'; close.autofocus = true; close.textContent = 'Close ×';
    close.setAttribute('aria-label', 'Close enlarged figure');
    const expanded = doc.createElement('img'); expanded.alt = image.alt;
    const caption = doc.createElement('p'); caption.textContent = figure.querySelector('figcaption')?.textContent || image.alt;
    dialog.append(close, expanded, caption); figure.append(dialog);
    const open = () => { expanded.src = source; dialog.showModal(); };
    imageButton.addEventListener('click', open); enlarge.addEventListener('click', open);
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });
  }
}
