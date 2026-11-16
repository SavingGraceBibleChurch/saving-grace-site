// Inline markup used by the church content: [label](href), **strong**, _emphasis_ and "\n" line breaks.
// Everything else is escaped, so content can never inject HTML.

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/gu;

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function isExternal(href: string): boolean {
  return /^https?:\/\//iu.test(href);
}

function allowed(href: string): boolean {
  return href.startsWith("/") || href.startsWith("#") || /^(https?:\/\/|mailto:|tel:)/iu.test(href);
}

function emphasis(escaped: string): string {
  return escaped
    .replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>")
    .replace(/(^|[\s(“"])_([^_\n][^_]*?)_(?=$|[\s.,;:!?)”"])/gu, "$1<em>$2</em>")
    .replaceAll("\n", "<br />");
}

export function inline(text: string): string {
  for (const marker of ["**", "_"]) {
    if (text.startsWith(marker) && text.endsWith(marker) && text.length > marker.length * 2) {
      const inner = text.slice(marker.length, -marker.length);
      if (!inner.replace(LINK, "").includes(marker)) {
        const tag = marker === "_" ? "em" : "strong";
        return `<${tag}>${inline(inner)}</${tag}>`;
      }
    }
  }
  let output = "";
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const [whole, label, href] = match as unknown as [string, string, string];
    output += emphasis(escapeHtml(text.slice(last, match.index)));
    if (!allowed(href)) {
      output += emphasis(escapeHtml(label));
    } else {
      const external = isExternal(href);
      output += `<a href="${escapeHtml(href)}"${external ? ' class="external" rel="noopener"' : ""}>${emphasis(escapeHtml(label))}</a>`;
    }
    last = match.index! + whole.length;
  }
  return output + emphasis(escapeHtml(text.slice(last)));
}

export function plainText(text: string): string {
  return text.replace(LINK, "$1").replace(/\*\*|(^|\s)_|_(?=\s|$)/gu, "$1").replace(/\s+/gu, " ").trim();
}
