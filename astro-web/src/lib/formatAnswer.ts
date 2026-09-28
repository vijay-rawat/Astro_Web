// Turns Astro's plain-text answer into blocks the UI can render.
// Supported: paragraphs (one per line), "- " list items, **bold**, and [n] citations.

export type Inline =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; value: string }
  | { kind: 'cite'; n: number };

export type Block = { kind: 'p'; inlines: Inline[] } | { kind: 'ul'; items: Inline[][] };

const TOKEN = /\*\*(.+?)\*\*|\[(\d+)\]/g;

export function parseInlines(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ kind: 'text', value: text.slice(last, index) });
    if (match[1] !== undefined) out.push({ kind: 'strong', value: match[1] });
    else out.push({ kind: 'cite', n: Number(match[2]) });
    last = index + match[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) });
  return out;
}

export function parseAnswer(text: string): Block[] {
  const blocks: Block[] = [];
  let list: Inline[][] | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) {
      list = null;
      continue;
    }
    if (line.startsWith('- ')) {
      if (!list) {
        list = [];
        blocks.push({ kind: 'ul', items: list });
      }
      list.push(parseInlines(line.slice(2)));
    } else {
      list = null;
      blocks.push({ kind: 'p', inlines: parseInlines(line) });
    }
  }
  return blocks;
}

/** For speech and copy: drop citation markers and markdown. */
export function stripCitations(text: string): string {
  return text
    .replace(/\[(\d+)\]/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^- /gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}
