"""Regenerate the small, clearly labeled attachment used by the demo pages."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from pypdf import PdfReader

root = Path(__file__).resolve().parent.parent
destination = root / 'public/documents/demo-handout.pdf'
destination.parent.mkdir(parents=True, exist_ok=True)
c = canvas.Canvas(str(destination), pagesize=A4)
c.setTitle('Demo attachment - Z-hang academic hub')
c.setAuthor('Z-hang academic hub')
w, h = A4
c.setFillColor(HexColor('#f8f7f3')); c.rect(0, 0, w, h, fill=1, stroke=0)
c.setFillColor(HexColor('#286b70')); c.setFont('Courier', 9)
c.drawString(50, h-62, 'THE ACADEMIC GARDEN / DEMONSTRATION ATTACHMENT')
c.setFillColor(HexColor('#1c343c')); c.setFont('Times-Roman', 32)
c.drawString(50, h-120, 'A place for course materials.')
c.setStrokeColor(HexColor('#dbe0db')); c.line(50, h-145, w-50, h-145)
c.setFont('Helvetica', 11)
lines = [
    'This is a small Demo PDF for testing the academic hub.',
    'It is not an actual lecture handout, research result, or publication.',
    '',
    'The accompanying page demonstrates:',
    '  - A desktop PDF preview',
    '  - Open and Download links',
    '  - A mobile fallback to your preferred PDF reader',
    '',
    'Replace this file with your own authorized course material,',
    'then update the attachment URL in the Markdown frontmatter.',
    '',
    'Small PDFs can live in public/documents or public/uploads.',
    'Keep large files and raw scientific datasets in external archives.',
]
y = h-183
for line in lines:
    c.drawString(50, y, line); y -= 23
c.setFont('Courier', 9); c.setFillColor(HexColor('#687779'))
c.drawString(50, 48, 'DEMO / 2026-10-02'); c.drawRightString(w-50, 48, '01')
c.save()
assert len(PdfReader(destination).pages) == 1
print(destination)
