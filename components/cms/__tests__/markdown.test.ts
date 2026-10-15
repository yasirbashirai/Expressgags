/**
 * Markdown renderer safety + formatting. The renderer output is injected as HTML on public pages,
 * so every XSS vector must come out inert.
 */
import { describe, expect, it } from "vitest";
import { markdownToText, mediaIdFrom, referencedMediaIds, renderMarkdown, safeHref } from "../markdown";

const opts = { mediaBase: "https://api.example.test" };
const html = (md: string) => renderMarkdown(md, opts);

describe("markdown renderer — safety", () => {
  it("escapes raw HTML and script tags", () => {
    const out = html('<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/<img src=x/i);
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("onerror=&quot;alert(2)&quot;");
  });

  it("drops javascript:, data:, vbscript: and protocol-relative links", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<b>x</b>", "vbscript:msgbox(1)", "//evil.example/x"]) {
      const out = html(`[click](${bad})`);
      expect(out).not.toMatch(/<a /);
      expect(out).not.toMatch(/javascript:|vbscript:|data:text/i);
    }
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("https://ok.example/a?b=1")).toBe("https://ok.example/a?b=1");
    expect(safeHref("/request-a-quote")).toBe("/request-a-quote");
  });

  it("cannot break out of attributes with quotes", () => {
    const out = html('[x](https://a.example/"onmouseover="alert(1))');
    expect(out).not.toMatch(/onmouseover="/);
    const img = html('![a" onerror="alert(1)](media:abcdefgh12345678)');
    expect(img).toMatch(/alt="a&quot; onerror=&quot;alert\(1\)"/);
    expect(img).not.toMatch(/ onerror="/);
  });

  it("only embeds images that point at public CMS media", () => {
    expect(html("![x](https://evil.example/tracker.png)")).not.toMatch(/<img/);
    expect(html("![x](media:abc)")).not.toMatch(/<img/); // id too short
    const ok = html("![Truck at hotel](media:cmabcdefgh123456)");
    expect(ok).toContain('<img src="https://api.example.test/v1/content/media/cmabcdefgh123456" alt="Truck at hotel"');
    expect(mediaIdFrom("https://api.example.test/v1/content/media/cmabcdefgh123456")).toBe("cmabcdefgh123456");
  });

  it("external links open safely", () => {
    expect(html("[site](https://example.com)")).toContain('rel="noopener noreferrer nofollow"');
    expect(html("[quote](/request-a-quote)")).not.toContain("target=");
  });
});

describe("markdown renderer — formatting", () => {
  it("renders headings (h1 demoted to h2), lists, quotes, emphasis and rules", () => {
    const out = html("# Title\n\n### Sub\n\nSome **bold** and *italic* and `code`.\n\n- one\n- two\n\n1. first\n2. second\n\n> note\n\n---");
    expect(out).toContain('<h2 id="title">Title</h2>');
    expect(out).toContain('<h3 id="sub">Sub</h3>');
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
    expect(out).toContain("<code>code</code>");
    expect(out).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(out).toContain("<ol><li>first</li><li>second</li></ol>");
    expect(out).toContain("<blockquote><p>note</p></blockquote>");
    expect(out).toContain("<hr />");
  });

  it("excerpts and media references", () => {
    expect(markdownToText("## Hi\n\nA [link](https://x.example) and **bold**.")).toBe("Hi A link and bold.");
    expect(referencedMediaIds("![a](media:aaaaaaaaaaaa)\n![b](https://evil/x.png)\n![c](/v1/content/media/bbbbbbbbbbbb)")).toEqual(["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
  });
});
