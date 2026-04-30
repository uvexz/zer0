import sanitizeHtml from "sanitize-html";

export type ParsedMention = {
  handle: string;
  domain: string | null;
  text: string;
};

export type ParsedHashtag = {
  tag: string;
  text: string;
};

export type ParsedUrl = {
  href: string;
  text: string;
};

export type ParsedZostText = {
  mentions: ParsedMention[];
  hashtags: ParsedHashtag[];
  urls: ParsedUrl[];
};

type TextEntity =
  | { type: "mention"; start: number; end: number; text: string; mention: ParsedMention }
  | { type: "hashtag"; start: number; end: number; text: string; hashtag: ParsedHashtag }
  | { type: "url"; start: number; end: number; text: string; url: ParsedUrl };

export function plainTextToHtml(input: string, options: { origin?: string } = {}) {
  return input
    .trim()
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${renderInlineText(paragraph, options).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function parseZostText(input: string): ParsedZostText {
  const entities = collectTextEntities(input);
  const mentions = new Map<string, ParsedMention>();
  const hashtags = new Map<string, ParsedHashtag>();
  const urls = new Map<string, ParsedUrl>();

  for (const entity of entities) {
    if (entity.type === "mention") {
      const key = mentionKey(entity.mention);
      if (!mentions.has(key)) mentions.set(key, entity.mention);
    } else if (entity.type === "hashtag") {
      const key = entity.hashtag.tag.toLowerCase();
      if (!hashtags.has(key)) hashtags.set(key, entity.hashtag);
    } else {
      if (!urls.has(entity.url.href)) urls.set(entity.url.href, entity.url);
    }
  }

  return {
    mentions: Array.from(mentions.values()),
    hashtags: Array.from(hashtags.values()),
    urls: Array.from(urls.values()),
  };
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

export function mentionKey(mention: Pick<ParsedMention, "handle" | "domain">) {
  return mention.domain ? `${mention.handle.toLowerCase()}@${mention.domain.toLowerCase()}` : mention.handle.toLowerCase();
}

export function mentionDisplay(mention: Pick<ParsedMention, "handle" | "domain">) {
  return `@${mention.handle}${mention.domain ? `@${mention.domain}` : ""}`;
}

export function mentionProfileHref(mention: Pick<ParsedMention, "handle" | "domain">, origin = "") {
  return `${origin}/@${mention.handle}${mention.domain ? `@${mention.domain}` : ""}`;
}

export function hashtagHref(tag: string, origin = "") {
  return `${origin}/search?q=${encodeURIComponent(`#${tag}`)}`;
}

function renderInlineText(input: string, options: { origin?: string }) {
  const entities = collectTextEntities(input);
  let html = "";
  let cursor = 0;

  for (const entity of entities) {
    html += escapeHtml(input.slice(cursor, entity.start));
    html += renderEntity(entity, options);
    cursor = entity.end;
  }

  return html + escapeHtml(input.slice(cursor));
}

function renderEntity(entity: TextEntity, options: { origin?: string }) {
  if (entity.type === "url") {
    return `<a href="${escapeAttribute(entity.url.href)}" rel="nofollow noopener noreferrer" target="_blank">${escapeHtml(entity.text)}</a>`;
  }

  if (entity.type === "hashtag") {
    return `<a href="${escapeAttribute(hashtagHref(entity.hashtag.tag, options.origin))}" rel="tag">${escapeHtml(entity.text)}</a>`;
  }

  return `<a href="${escapeAttribute(mentionProfileHref(entity.mention, options.origin))}" class="mention" rel="mention">${escapeHtml(entity.text)}</a>`;
}

function collectTextEntities(input: string) {
  const entities: TextEntity[] = [];

  for (const match of input.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const raw = match[0];
    const start = match.index ?? 0;
    const text = stripTrailingUrlPunctuation(raw);
    if (!text) continue;
    const href = normalizeHttpUrl(text);
    if (!href) continue;
    entities.push({ type: "url", start, end: start + text.length, text, url: { href, text } });
  }

  for (const match of input.matchAll(/(^|[^\p{L}\p{N}_@])@([a-zA-Z0-9_]{2,32})(?:@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}))?(?![a-zA-Z0-9_@.-])/gu)) {
    const prefix = match[1] ?? "";
    const start = (match.index ?? 0) + prefix.length;
    const text = match[0].slice(prefix.length);
    const handle = match[2]?.toLowerCase();
    if (!handle) continue;
    const domain = match[3]?.toLowerCase() ?? null;
    entities.push({ type: "mention", start, end: start + text.length, text, mention: { handle, domain, text } });
  }

  for (const match of input.matchAll(/(^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_][\p{L}\p{N}_-]{0,63})(?![\p{L}\p{N}_-])/gu)) {
    const prefix = match[1] ?? "";
    const start = (match.index ?? 0) + prefix.length;
    const text = match[0].slice(prefix.length);
    const tag = match[2];
    if (!tag) continue;
    entities.push({ type: "hashtag", start, end: start + text.length, text, hashtag: { tag, text } });
  }

  return entities
    .sort((a, b) => a.start - b.start || priority(a.type) - priority(b.type))
    .reduce<TextEntity[]>((filtered, entity) => {
      const previous = filtered[filtered.length - 1];
      if (!previous || entity.start >= previous.end) filtered.push(entity);
      return filtered;
    }, []);
}

function priority(type: TextEntity["type"]) {
  if (type === "url") return 0;
  if (type === "mention") return 1;
  return 2;
}

function stripTrailingUrlPunctuation(input: string) {
  let output = input;
  while (/[),.!?:;\]]$/.test(output)) {
    if (output.endsWith(")") && countChar(output, "(") >= countChar(output, ")")) break;
    output = output.slice(0, -1);
  }
  return output;
}

function normalizeHttpUrl(input: string) {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function countChar(input: string, char: string) {
  return Array.from(input).filter((value) => value === char).length;
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function escapeAttribute(input: string) {
  return escapeHtml(input);
}
