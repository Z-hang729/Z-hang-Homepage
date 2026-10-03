export default function remarkBase() {
  const base = (process.env.SITE_BASE_PATH || "/").replace(/\/$/, "");
  return (tree) => {
    function walk(node) {
      if (
        ["link", "image", "definition"].includes(node.type) &&
        node.url?.startsWith("/") &&
        !node.url.startsWith("//") &&
        base &&
        !node.url.startsWith(base + "/")
      )
        node.url = base + node.url;
      node.children?.forEach(walk);
    }
    walk(tree);
  };
}
