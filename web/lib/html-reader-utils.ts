/**
 * Pure utility functions extracted from HtmlReader for testability and reuse.
 */

interface TranslationParagraph {
  index: number;
  translation: string;
}

// Arabic honorific ligatures that many fonts don't render.
// Expand to full Arabic text so they display on all devices.
const HONORIFIC_MAP: Record<string, string> = {
  "\uFDFA": "صلى الله عليه وسلم",
  "\uFDFB": "جل جلاله",
  "\uFDF0": "صلعم",
  "\uFDF1": "قلے",
  "\uFDF2": "الله",
  "\uFDF3": "أكبر",
  "\uFDF4": "محمد",
  "\uFDF5": "صلعم",
  "\uFDF6": "رسول",
  "\uFDF7": "عليه",
  "\uFDF8": "وسلم",
  "\uFDF9": "صلى",
  "\uFD40": "رحمه الله",
  "\uFD41": "رحمها الله",
  "\uFD42": "رحمهما الله",
  "\uFD43": "رحمهم الله",
  "\uFD44": "حفظه الله",
  "\uFD45": "حفظها الله",
  "\uFD46": "حفظهما الله",
  "\uFD47": "رضي الله عنه",
  "\uFD48": "رضي الله عنها",
  "\uFD49": "رضي الله عنهما",
  "\uFD4A": "رضي الله عنهم",
  "\uFD4B": "غفر الله له",
  "\uFD4C": "غفر الله لها",
  "\uFD4D": "عليه السلام",
  "\uFD4E": "عليها السلام",
};
const HONORIFIC_RE = new RegExp(`[${Object.keys(HONORIFIC_MAP).join("")}]`, "g");

/** Expand honorific ligatures in any text (titles, content, etc.) */
export function expandHonorifics(text: string): string {
  return text.replace(HONORIFIC_RE, (ch) => HONORIFIC_MAP[ch] ?? ch);
}

/**
 * Format Turath HTML content for display.
 * Turath content is mostly plain text with newlines and occasional
 * <span data-type="title"> tags for headings. Footnotes appear after
 * a "___" separator line with markers like (^١).
 */
export function formatContentHtml(
  html: string,
  enableWordWrap = true,
  translationParagraphs?: TranslationParagraph[],
): string {
  html = expandHonorifics(html);

  // Join multi-line title spans into single lines
  html = html.replace(
    /<span\s+data-type=['"]title['"][^>]*>[\s\S]*?<\/span>/g,
    (match) => match.replace(/\n/g, ' ')
  );

  const lines = html.split(/\n/);
  const formatted: string[] = [];
  let inFootnotes = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^[\s*]+$/.test(trimmed) && trimmed.includes('*')) {
      formatted.push(
        '<p style="text-align:center;margin:1.5em 0;letter-spacing:0.4em;opacity:0.35;font-size:0.9em">* * * * *</p>'
      );
      continue;
    }

    if (/^_{3,}$/.test(trimmed)) {
      inFootnotes = true;
      formatted.push(
        '<div style="margin-top:2em;padding-top:1.5em;text-align:center"><span style="display:inline-block;width:3em;border-top:1px solid currentColor;opacity:0.4"></span></div><div style="opacity:0.85">'
      );
      continue;
    }

    const withMarkers = trimmed.replace(/\(\^([٠-٩0-9]+)\)/g, '($1)');

    if (inFootnotes) {
      const footnoteStyled = withMarkers.replace(
        /^\(([٠-٩0-9]+)\)\s*/,
        '<span style="font-weight:bold">($1)</span> '
      );
      formatted.push(
        `<p style="margin:0.5em 0;font-size:0.9em;padding-right:1.5em;text-indent:-1.5em">${footnoteStyled}</p>`
      );
    } else if (trimmed.includes("data-page")) {
      formatted.push(`<p style="margin:0.4em 0">${withMarkers}</p>`);
    } else if (trimmed.includes("data-type")) {
      const styled = withMarkers
        .replace(
          /^(.*?)<span\s+data-type=['"]title['"][^>]*(?:id=['"][^'"]*['"])?\s*>/gi,
          '<h3 style="font-size:1.3em;font-weight:bold;margin:1.5em 0 0.8em;padding-bottom:0.4em;border-bottom:2px solid currentColor;opacity:1;color:inherit">$1'
        )
        .replace(/<\/span>(.*)$/i, (_, after) => {
          const rest = after.trim();
          return rest
            ? `</h3>\n<p style="margin:0.4em 0">${rest}</p>`
            : '</h3>';
        });
      formatted.push(styled);
    } else {
      formatted.push(`<p style="margin:0.5em 0 0.6em">${withMarkers}</p>`);
    }
  }

  if (inFootnotes) {
    formatted.push('</div>');
  }

  if (translationParagraphs && translationParagraphs.length > 0) {
    const translationMap = new Map(translationParagraphs.map((p) => [p.index, p.translation]));
    const interleaved: string[] = [];
    for (let i = 0; i < formatted.length; i++) {
      interleaved.push(formatted[i]);
      const translation = translationMap.get(i);
      if (translation) {
        interleaved.push(
          `<p dir="ltr" style="margin:0.3em 0 0.8em;padding:0.5em 0.8em;border-inline-start:3px solid hsl(var(--brand));opacity:0.85;font-size:0.88em;line-height:1.7;font-family:system-ui,sans-serif">${translation}</p>`
        );
      }
    }
    formatted.length = 0;
    formatted.push(...interleaved);
  }

  let result = formatted.join('\n');
  if (enableWordWrap) result = wrapWords(result);

  return result;
}

/** Wrap Arabic word tokens in clickable spans (operates on text nodes only). */
export function wrapWords(html: string): string {
  return html.replace(
    /(>[^<]*)/g,
    (_, textNode: string) =>
      textNode.replace(
        /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+/g,
        (word: string) => `<span class="word" data-word="${word}">${word}</span>`
      )
  );
}

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];

/** Display label for a page: printed number if available, Roman numeral for front matter */
export function displayPageNumber(page: { printedPageNumber?: number | null } | null, internalPage: number): string {
  if (page?.printedPageNumber != null) return page.printedPageNumber.toString();
  return ROMAN[internalPage] ?? internalPage.toString();
}
