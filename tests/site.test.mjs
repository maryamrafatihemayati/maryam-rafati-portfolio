// بررسی‌های خودکار پورتفولیو. اجرا: npm test
// هیچ وابستگی خارجی ندارد؛ فقط Node نسخهٔ ۲۰ به بالا لازم است.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve, posix } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = "https://maryamrafatihemayati.github.io/maryam-rafati-portfolio/";
const FIGMA_FILE_KEY = "LCT64nO02nd3zQWZebhM3l";
const PAGES = ["index.html", "case-studies/nill-pastry.html"];
const CASE = "case-studies/nill-pastry.html";

const read = (p) => readFileSync(join(ROOT, p), "utf8");
const html = Object.fromEntries(PAGES.map((p) => [p, read(p)]));
const css = read("css/styles.css");
const js = read("js/main.js");

// ---------- ابزارها ----------

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function tags(src, name) {
  return [...src.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) => ({
    raw: m[0],
    attr: attrs(m[0]),
  }));
}

function ids(src) {
  return new Set([...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}

/** متن صفحه بدون توضیحات HTML و اسکریپت‌ها؛ ویژگی‌هایی مثل alt و title باقی می‌مانند. */
function content(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
}

/** همهٔ ارجاع‌های محلی یک صفحه (src، href، srcset). */
function localRefs(page) {
  const out = [];
  for (const m of html[page].matchAll(/\s(src|href|srcset)="([^"]+)"/g)) {
    const value = m[1] === "srcset" ? m[2].split(",")[0].trim().split(/\s+/)[0] : m[2];
    if (/^(https?:|mailto:|tel:|data:|#)/.test(value)) continue;
    out.push(value);
  }
  return out;
}

function resolveFrom(page, ref) {
  const clean = ref.split("#")[0].split("?")[0];
  return join(ROOT, dirname(page), clean);
}

/** ابعاد PNG و WebP را مستقیم از سرآیند فایل می‌خواند. */
function imageSize(file) {
  const b = readFileSync(file);
  if (b.subarray(1, 4).toString("ascii") === "PNG") {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  if (b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") {
    const chunk = b.subarray(12, 16).toString("ascii");
    if (chunk === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (chunk === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const [b0, b1, b2, b3] = [b[21], b[22], b[23], b[24]];
      return {
        w: 1 + (((b1 & 0x3f) << 8) | b0),
        h: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      };
    }
  }
  throw new Error(`قالب تصویر شناخته نشد: ${file}`);
}

/** قواعد CSS به‌صورت [انتخابگر، بدنه]، شامل قواعد داخل media query. */
function cssRules(src) {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...noComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
}

// =====================================================================

describe("ساختار صفحه‌ها", () => {
  for (const page of PAGES) {
    test(`${page}: زبان فارسی و جهت راست‌به‌چپ`, () => {
      assert.match(html[page], /<html[^>]*\slang="fa"/);
      assert.match(html[page], /<html[^>]*\sdir="rtl"/);
    });

    test(`${page}: عنوان، توضیح متا و viewport`, () => {
      const title = html[page].match(/<title>([^<]*)<\/title>/);
      assert.ok(title && title[1].trim(), "تگ title خالی است یا وجود ندارد");
      assert.match(html[page], /<meta name="description" content="[^"]{20,}"/);
      assert.match(html[page], /<meta name="viewport"/);
    });

    test(`${page}: دقیقاً یک تیتر h1`, () => {
      assert.equal(tags(html[page], "h1").length, 1);
    });

    test(`${page}: تگ‌های باز و بسته متوازن‌اند`, () => {
      const broken = [];
      for (const t of ["div", "section", "article", "figure", "picture", "p", "ul", "ol", "li", "table", "nav", "header", "footer", "main"]) {
        const open = (html[page].match(new RegExp(`<${t}[\\s>]`, "g")) || []).length;
        const close = (html[page].match(new RegExp(`</${t}>`, "g")) || []).length;
        if (open !== close) broken.push(`<${t}> باز=${open} بسته=${close}`);
      }
      assert.deepEqual(broken, []);
    });

    test(`${page}: نشانی canonical و og:image به سایت منتشرشده اشاره می‌کنند`, () => {
      const canonical = html[page].match(/<link rel="canonical" href="([^"]+)"/);
      assert.ok(canonical, "canonical وجود ندارد");
      assert.ok(canonical[1].startsWith(SITE_URL), canonical[1]);

      const og = html[page].match(/<meta property="og:image" content="([^"]+)"/);
      assert.ok(og, "og:image وجود ندارد");
      const local = join(ROOT, og[1].slice(SITE_URL.length));
      assert.ok(existsSync(local), `تصویر og:image روی دیسک نیست: ${og[1]}`);
    });
  }
});

describe("پیوندها و فایل‌ها", () => {
  for (const page of PAGES) {
    test(`${page}: همهٔ فایل‌های ارجاع‌شده وجود دارند`, () => {
      const missing = localRefs(page).filter((r) => !existsSync(resolveFrom(page, r)));
      assert.deepEqual(missing, []);
    });

    test(`${page}: پیوندهای داخلی به بخش موجود می‌رسند`, () => {
      const broken = [];
      for (const { attr } of tags(html[page], "a")) {
        const href = attr.href || "";
        if (/^(https?:|mailto:|tel:)/.test(href) || !href.includes("#")) continue;
        const [file, frag] = href.split("#");
        if (!frag) continue;
        const target = file ? posix.join(posix.dirname(page), file) : page;
        const src = html[target] ?? read(target);
        if (!ids(src).has(frag)) broken.push(href);
      }
      assert.deepEqual(broken, []);
    });

    test(`${page}: پیوندهای بیرونی که در زبانهٔ تازه باز می‌شوند rel=noopener دارند`, () => {
      const unsafe = tags(html[page], "a")
        .filter(({ attr }) => attr.target === "_blank" && !/noopener/.test(attr.rel || ""))
        .map(({ attr }) => attr.href);
      assert.deepEqual(unsafe, []);
    });

    test(`${page}: هیچ پیوند ناامن http وجود ندارد`, () => {
      assert.doesNotMatch(html[page], /(?:src|href)="http:\/\//);
    });
  }

  test("فونت‌های تعریف‌شده در CSS وجود دارند", () => {
    const missing = [...css.matchAll(/url\("([^"]+)"\)/g)]
      .map((m) => m[1])
      .filter((u) => !existsSync(join(ROOT, "css", u)));
    assert.deepEqual(missing, []);
  });

  test("رزومهٔ PDF وجود دارد و از صفحهٔ اصلی لینک شده", () => {
    const pdf = "resume/Maryam-Rafati-UXUI-Resume.pdf";
    assert.ok(existsSync(join(ROOT, pdf)));
    assert.ok(html["index.html"].includes(`href="${pdf}"`));
  });

  test("لینک فایل Figma در هر دو صفحه هست و در زبانهٔ تازه باز می‌شود", () => {
    for (const page of PAGES) {
      const links = tags(html[page], "a").filter(({ attr }) => (attr.href || "").includes("figma.com"));
      assert.ok(links.length > 0, `${page}: لینک Figma پیدا نشد`);
      for (const { attr } of links) {
        assert.match(attr.href, new RegExp(`^https://www\\.figma\\.com/design/${FIGMA_FILE_KEY}/`), attr.href);
        assert.equal(attr.target, "_blank");
        assert.match(attr.rel || "", /noopener/);
      }
    }
  });

  test("دادهٔ ساخت‌یافتهٔ JSON-LD معتبر است", () => {
    const block = html["index.html"].match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(block, "بلوک JSON-LD پیدا نشد");
    const data = JSON.parse(block[1]);
    assert.equal(data["@type"], "Person");
    assert.equal(data.url, SITE_URL);
  });
});

describe("کیس‌استادی", () => {
  test("فهرست چسبان دقیقاً با بخش‌های صفحه هم‌خوان است", () => {
    const sections = [...html[CASE].matchAll(/<section class="cs-section" id="([^"]+)"/g)].map((m) => m[1]);
    const toc = html[CASE].match(/<aside class="cs-toc"[\s\S]*?<\/aside>/)[0];
    const links = [...toc.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(links, sections);
  });

  test("حد تحمل پاسخ دایرکت ۱۲۰ دقیقه است، نه ۶۰", () => {
    assert.match(html[CASE], /۱۲۰/);
    assert.doesNotMatch(html[CASE], /۶۰\s*دقیقه/);
  });

  test("جدول تایپوگرافی همان هشت استایل فایل Figma را به ترتیب نشان می‌دهد", () => {
    const specs = [...html[CASE].matchAll(/<span class="spec">([^<]+)<\/span>/g)].map((m) => m[1].split(" · ")[0]);
    assert.deepEqual(specs, ["Display", "Headline", "Title/L", "Title/M", "Body/L", "Body/M", "Body/S", "Label"]);
  });

  test("ادعای قدیمی «Inter برای لاتین» برنگشته است", () => {
    assert.doesNotMatch(html[CASE], /<strong>Inter<\/strong>/);
  });

  test("بخش سیستم طراحی همهٔ نقش‌های رنگی را دارد", () => {
    for (const role of ["Primary", "Primary Container", "Secondary", "Secondary Container", "Tertiary", "Error", "Surface", "On Surface"]) {
      assert.ok(html[CASE].includes(`<b>${role}</b>`), `نقش رنگ جاافتاده: ${role}`);
    }
  });
});

describe("تصاویر", () => {
  for (const page of PAGES) {
    test(`${page}: هر تصویر متن جایگزین (alt) و ابعاد دارد`, () => {
      const bad = tags(html[page], "img")
        .filter(({ attr }) => !attr.alt?.trim() || !attr.width || !attr.height)
        .map(({ attr }) => attr.src);
      assert.deepEqual(bad, []);
    });

    test(`${page}: ابعاد اعلام‌شده با فایل واقعی برابر است`, () => {
      const wrong = [];
      for (const { attr } of tags(html[page], "img")) {
        const { w, h } = imageSize(resolveFrom(page, attr.src));
        if (Number(attr.width) !== w || Number(attr.height) !== h) {
          wrong.push(`${attr.src}: اعلام‌شده ${attr.width}x${attr.height}، واقعی ${w}x${h}`);
        }
      }
      assert.deepEqual(wrong, []);
    });

    test(`${page}: هر picture نسخهٔ WebP و پشتیبان PNG هم‌اندازه دارد`, () => {
      const blocks = [...html[page].matchAll(/<picture>([\s\S]*?)<\/picture>/g)].map((m) => m[1]);
      assert.ok(blocks.length > 0, "هیچ تگ picture پیدا نشد");
      for (const block of blocks) {
        const source = tags(block, "source")[0]?.attr;
        const img = tags(block, "img")[0]?.attr;
        assert.equal(source?.type, "image/webp");
        assert.match(img?.src ?? "", /\.png$/);
        assert.equal(source.srcset.replace(/\.webp$/, ""), img.src.replace(/\.png$/, ""));
        assert.deepEqual(imageSize(resolveFrom(page, source.srcset)), imageSize(resolveFrom(page, img.src)));
      }
    });
  }

  test("بودجهٔ حجم: هر WebP زیر ۱ مگابایت و مجموع زیر ۲٫۵ مگابایت", () => {
    const dir = join(ROOT, "assets/images/nill");
    const files = ["nill-ui-hero", "nill-ui-desktop", "nill-wireframe", "nill-ui-figma"].map((n) => join(dir, n + ".webp"));
    const sizes = files.map((f) => statSync(f).size);
    for (const [i, s] of sizes.entries()) assert.ok(s < 1024 * 1024, `${files[i]}: ${(s / 1024).toFixed(0)}K`);
    const total = sizes.reduce((a, b) => a + b, 0);
    assert.ok(total < 2.5 * 1024 * 1024, `مجموع ${(total / 1024).toFixed(0)}K`);
  });

  test("نسبت ابعاد بنر هیرو در CSS با تصویر واقعی یکی است", () => {
    const m = css.match(/\.hero-visual img\s*\{[^}]*aspect-ratio:\s*(\d+)\s*\/\s*(\d+)/);
    assert.ok(m, "aspect-ratio بنر هیرو پیدا نشد");
    const { w, h } = imageSize(join(ROOT, "assets/images/nill/nill-ui-hero.png"));
    assert.deepEqual([Number(m[1]), Number(m[2])], [w, h]);
  });
});

describe("تایپوگرافی و نگارش فارسی", () => {
  for (const page of PAGES) {
    test(`${page}: هیچ خط تیرهٔ میان‌جمله (— یا –) در متن نیست`, () => {
      const hits = [...content(html[page]).matchAll(/.{0,25}[—–].{0,25}/g)].map((m) => m[0].trim());
      assert.deepEqual(hits, []);
    });

    test(`${page}: املای نادرست رایج وجود ندارد`, () => {
      const text = content(html[page]);
      const wrong = ["نشئت", "مساله", "مسأله", "سوال", "تاخیر", "تایید", "موثر", "جزییات", "اسیاب", "نخود چی"].filter((w) => text.includes(w));
      if (/ه ی\s/.test(text)) wrong.push("کسرهٔ اضافهٔ جدا («ه ی» به‌جای «هٔ»)");
      assert.deepEqual(wrong, []);
    });

    test(`${page}: عبارات محاوره‌ای حذف‌شده برنگشته‌اند`, () => {
      const text = content(html[page]);
      const found = ["تا ته", "سر کلاس", "نفس بکشد", "چه خبر", "حرف بزنیم", "قشنگ", "پول داده", "وسوسه", "جلویم را", "از دست داده بود"].filter((p) => text.includes(p));
      assert.deepEqual(found, []);
    });

    test(`${page}: ادعای پیاده‌سازی سایت توسط خود طراح وجود ندارد`, () => {
      const text = content(html[page]);
      assert.doesNotMatch(text, /ساخته[‌ ]?شده با HTML/);
      assert.doesNotMatch(text, /خود(م)? پیاده[‌ ]?سازی/);
    });
  }

  test("letter-spacing فقط روی متن لاتین و عدد؛ هرگز منفی", () => {
    // فارسی خط متصل است و فاصله‌گذاری حروف اتصال آن را می‌شکند
    const allowed = new Set([".brand span", ".step::before", ".finding h3 span"]);
    const offenders = [];
    for (const [selector, body] of cssRules(css)) {
      const m = body.match(/letter-spacing:\s*(-?[\d.]+)/);
      if (!m) continue;
      const value = parseFloat(m[1]);
      if (value < 0) offenders.push(`${selector}: منفی (${m[1]})`);
      else if (value > 0 && !allowed.has(selector)) offenders.push(`${selector}: ${m[1]}`);
    }
    assert.deepEqual(offenders, []);
  });

  test("فونت‌ها به‌صورت محلی: استعداد در پنج وزن، وزیرمتن در چهار وزن", () => {
    const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => ({
      family: m[1].match(/font-family:\s*"([^"]+)"/)[1],
      weight: m[1].match(/font-weight:\s*(\d+)/)[1],
    }));
    const weightsOf = (f) => faces.filter((x) => x.family === f).map((x) => x.weight);
    assert.deepEqual(weightsOf("Estedad"), ["400", "500", "600", "700", "800"]);
    assert.deepEqual(weightsOf("Vazirmatn"), ["400", "500", "600", "700"]);
    assert.doesNotMatch(css, /fonts\.googleapis|cdn\./);
  });

  test("نمونه‌های تایپوگرافی پروژه با خود وزیرمتن نمایش داده می‌شوند", () => {
    assert.match(css, /\.type-scale \.sample\s*\{[^}]*font-family:\s*"Vazirmatn"/);
  });
});

describe("تم و رفتار", () => {
  test("تم تیره به‌طور کامل حذف شده است", () => {
    assert.doesNotMatch(css, /prefers-color-scheme|data-theme/);
    assert.doesNotMatch(js, /themeToggle|localStorage/);
    for (const page of PAGES) {
      assert.doesNotMatch(html[page], /themeToggle|data-theme|prefers-color-scheme/, page);
    }
  });

  test("حرکت‌ها به تنظیم «کاهش حرکت» کاربر احترام می‌گذارند", () => {
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(js, /prefers-reduced-motion/);
  });
});
