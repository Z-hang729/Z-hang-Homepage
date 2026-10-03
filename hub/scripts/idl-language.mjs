// Minimal TextMate grammar for IDL, kept local because Shiki does not bundle IDL.
export default {
  name: "idl",
  displayName: "IDL",
  scopeName: "source.idl",
  patterns: [
    { name: "comment.line.semicolon.idl", match: ";.*$" },
    {
      name: "string.quoted.single.idl",
      begin: "'",
      end: "'",
      patterns: [{ name: "constant.character.escape.idl", match: "''" }],
    },
    {
      name: "string.quoted.double.idl",
      begin: '"',
      end: '"',
      patterns: [{ name: "constant.character.escape.idl", match: '""' }],
    },
    {
      name: "keyword.control.idl",
      match:
        "\\b(?i:pro|function|end|endif|endfor|endwhile|endelse|if|then|else|for|do|while|repeat|until|begin|return|case|of|endcase|switch|endswitch|break|continue)\\b",
    },
    {
      name: "support.function.idl",
      match:
        "\\b(?i:print|readfits|writefits|findgen|dindgen|fltarr|dblarr|n_elements|where|total|mean|sqrt|sin|cos|exp|alog|plot|image|size|reform|shift)\\b",
    },
    {
      name: "constant.numeric.idl",
      match: "\\b[0-9]+(?:\\.[0-9]*)?(?:[eEdD][+-]?[0-9]+)?[bBsSlL]*\\b",
    },
    { name: "variable.language.idl", match: "![A-Za-z_][A-Za-z_0-9]*" },
    {
      name: "keyword.operator.idl",
      match: "\\b(?i:eq|ne|lt|le|gt|ge|and|or|xor|not|mod)\\b|[+*/=<>-]",
    },
  ],
};
