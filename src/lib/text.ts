import sanitizeHtml from "sanitize-html";

export function plainTextToHtml(input: string) {
  const escaped = sanitizeHtml(input.trim(), {
    allowedTags: [],
    allowedAttributes: {},
  });

  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function sanitizeRemoteHtml(input: string) {
  return sanitizeHtml(input, {
    allowedTags: ["p", "br", "span", "a", "strong", "em", "code", "pre"],
    allowedAttributes: {
      a: ["href", "rel", "target"],
      span: ["class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
  });
}

export function truncate(input: string, length = 180) {
  return input.length > length ? `${input.slice(0, length - 1)}...` : input;
}
