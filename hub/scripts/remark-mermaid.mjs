export default function remarkMermaid() {
  return (tree) => {
    function walk(node) {
      if (!node.children) return;
      node.children = node.children.map((child) => {
        if (child.type === "code" && child.lang === "mermaid") {
          const escaped = child.value
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          return {
            type: "html",
            value: `<pre class="mermaid">${escaped}</pre>`,
          };
        }
        walk(child);
        return child;
      });
    }
    walk(tree);
  };
}
