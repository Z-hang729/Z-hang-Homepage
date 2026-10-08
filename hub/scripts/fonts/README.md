# CV font

`NotoSansSC-Regular.ttf` is a static weight-400 instance of Noto Sans SC, derived from the installed genuine Noto Sans SC variable font. It provides Latin and Simplified Chinese glyphs offline on Windows, macOS, and Linux. PDFKit embeds only the used glyphs as a TrueType subset, with a Unicode character map for selectable and searchable text.

Upstream: <https://github.com/google/fonts/tree/main/ofl/notosanssc>

License: SIL Open Font License 1.1, preserved in `OFL.txt`. Copyright belongs to the original font authors; this is a font asset, not a claim of website-owner authorship. The source font's variation axis defaulted to weight 100. A regular static instance was produced with FontTools `instantiateVariableFont(font, {"wght": 400}, inplace=True)`, then saved as TrueType. FontTools is not required to build the website.

Do not replace this with a screenshot, a Type3 hand-drawn font, or an unlicensed system font. The CV generator requires this bundled asset and fails clearly if it is absent.
