import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { marked, Renderer } from "marked";

const renderer = new Renderer();
renderer.code = ({ text, lang }) => {
  const language = lang?.match(/^[\w+-]+/)?.[0];
  const canHighlight = language && hljs.getLanguage(language);
  const highlighted = canHighlight
    ? hljs.highlight(text ?? "", { language }).value
    : escapeHtml(text ?? "");
  const label = canHighlight ? language : "code";

  return `<div class="code-block">
    <div class="code-block-toolbar">
      <span>${escapeHtml(label)}</span>
      <button class="code-copy-button" type="button" data-copy-code data-copy-label="Copy code" aria-label="Copy code">Copy code</button>
    </div>
    <pre><code class="${canHighlight ? `language-${escapeHtml(language)}` : ""}">${highlighted}</code></pre>
  </div>`;
};

marked.use({ gfm: true, breaks: false, renderer });

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export function renderMarkdown(source) {
  if (typeof source !== "string" || !source.trim()) {
    return "<p>No text response.</p>";
  }

  let html;
  try {
    html = marked.parse(source);
  } catch {
    html = `<p>${escapeHtml(source)}</p>`;
  }

  const safeHtml = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel", "data-copy-code", "aria-label"],
  });
  const template = document.createElement("template");
  template.innerHTML = safeHtml;

  for (const table of template.content.querySelectorAll("table")) {
    const wrapper = document.createElement("div");
    wrapper.className = "markdown-table-scroll";
    table.replaceWith(wrapper);
    wrapper.append(table);
  }

  for (const link of template.content.querySelectorAll("a[href]")) {
    const url = new URL(link.href, window.location.href);
    if (["http:", "https:"].includes(url.protocol) && url.origin !== window.location.origin) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
  }

  return template.innerHTML;
}
