#!/usr/bin/env node
/**
 * tao-danh-sach.js
 * ------------------------------------------------------------------
 * Cập nhật danh sách bài viết mới nhất lên trang tin-tuc.html.
 *
 * CÁCH DÙNG (trong VS Code, mở Terminal tại thư mục website):
 *     node tao-danh-sach.js
 *
 * CẤU TRÚC THƯ MỤC:
 *     nhan-dinh/   -> các bài nhận định        (*.html)
 *     tin-tuc/     -> các bài tin tức          (*.html)
 *     kien-thuc/   -> các bài viết kiến thức   (*.html)
 *     tin-tuc.html -> trang được cập nhật
 *
 * MỖI BÀI VIẾT NÊN CÓ (script đọc từ chính file bài viết):
 *     - Tiêu đề : thẻ <h1> (nếu không có sẽ dùng <title>)
 *     - Mô tả   : <meta name="description" content="...">
 *     - Ngày    : <meta property="article:published_time" content="2026-11-26">
 *                 (hoặc <time datetime="2026-11-26">). Nếu thiếu, dùng ngày
 *                 sửa file. Bài nào ngày mới hơn sẽ đứng trước.
 *
 * Script chỉ thay nội dung nằm giữa cặp dấu:
 *     <!-- DANH-SACH:nhan-dinh:START -->  ...  <!-- DANH-SACH:nhan-dinh:END -->
 * Phần còn lại của trang không bị đụng tới. Chạy nhiều lần vẫn cho kết quả như nhau.
 * Không cần cài thêm thư viện nào.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/* ====================== CẤU HÌNH ====================== */
const ROOT = __dirname;
const PAGE = path.join(ROOT, 'tin-tuc.html');
const LIMIT = 6; // số bài mới nhất cho mỗi chuyên mục
const CATEGORIES = [
  { key: 'nhan-dinh', folder: 'bai-viet/nhan-dinh', label: 'Nhận định' },
  { key: 'tin-tuc', folder: 'bai-viet/tin-tuc', label: 'Tin tức' },
  { key: 'kien-thuc', folder: 'bai-viet/kien-thuc', label: 'Kiến thức' },
];
const MAX_DESC = 160; // độ dài tối đa của đoạn mô tả hiển thị
/* ====================================================== */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, code) {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    const k = code.toLowerCase();
    return Object.prototype.hasOwnProperty.call(ENTITIES, k) ? ENTITIES[k] : m;
  });
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseAttrs(tag) {
  const attrs = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = m[2] !== undefined ? m[2] : m[3];
  return attrs;
}

function findMeta(html, attr, value) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const t of tags) {
    const a = parseAttrs(t);
    if (a[attr] && a[attr].toLowerCase() === value && a.content !== undefined) return decodeEntities(a.content).trim();
  }
  return '';
}

function truncate(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:!-]+$/, '') + '…';
}

/* Trả về { ts, iso, display } hoặc null nếu không đọc được ngày */
function parseDate(raw) {
  if (!raw) return null;
  raw = raw.trim();
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return build(+m[1], +m[2], +m[3], raw);
  m = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) return build(+m[3], +m[2], +m[1], raw);
  return null;

  function build(y, mo, d, src) {
    const t = Date.parse(m[0].length === 10 && /^\d{4}/.test(src) ? src.slice(0, 10) + 'T00:00:00Z' : src);
    const ts = Number.isNaN(t) ? Date.UTC(y, mo - 1, d) : t;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return { ts, iso: y + '-' + pad(mo) + '-' + pad(d), display: pad(d) + '/' + pad(mo) + '/' + y };
  }
}

function dateFromStat(stat) {
  const d = stat.mtime;
  const pad = (n) => String(n).padStart(2, '0');
  const y = d.getFullYear(), mo = d.getMonth() + 1, day = d.getDate();
  return { ts: d.getTime(), iso: y + '-' + pad(mo) + '-' + pad(day), display: pad(day) + '/' + pad(mo) + '/' + y };
}

// lấy ảnh thumbnail bài viết để cập nhật lên trang tin tức
// Lấy đường dẫn ảnh đầu tiên trong bài viết
function getFirstImage(html, folder) {
    const imgs = html.match(/<img\b[^>]*>/gi) || [];

    for (const img of imgs) {
        const attrs = parseAttrs(img);

        // Hỗ trợ cả ảnh tải thông thường và ảnh lazy load
        let src = attrs.src || attrs['data-src'] || attrs['data-original'];

        if (!src) continue;

        src = decodeEntities(src).trim();

        // Không sử dụng ảnh dạng dữ liệu nhúng
        if (/^data:/i.test(src)) continue;

        // Ảnh từ website khác hoặc đường dẫn tuyệt đối
        if (/^(https?:)?\/\//i.test(src) || src.startsWith('/')) {
            return src;
        }

        // Chuyển đường dẫn tương đối thành đường dẫn tính từ thư mục gốc
        const parts = src.match(/^([^?#]*)([?#].*)?$/);
        const imagePath = parts[1];
        const suffix = parts[2] || '';

        const relativePath = path.posix.normalize(
            path.posix.join(folder.replace(/\\/g, '/'), imagePath)
        );

        return relativePath + suffix;
    }

    return '';
}

function readArticle(dir, file) {
  const full = path.join(dir, file);
  const html = fs.readFileSync(full, 'utf8');
  const stat = fs.statSync(full);

  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const ti = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  let title = (h1 && stripTags(h1[1])) || (ti && stripTags(ti[1])) || file.replace(/\.html$/i, '').replace(/-/g, ' ');

  let desc = findMeta(html, 'name', 'description') || findMeta(html, 'property', 'og:description');
  if (!desc) {
    const p = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
    desc = p ? stripTags(p[1]) : '';
  }
  desc = truncate(desc.replace(/\s+/g, ' ').trim(), MAX_DESC);

  let date = parseDate(findMeta(html, 'property', 'article:published_time')) || parseDate(findMeta(html, 'name', 'date'));
  if (!date) {
    const t = html.match(/<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["']/i);
    date = t && parseDate(t[1]);
  }
  const hasDate = !!date;
  if (!date) date = dateFromStat(stat);

const image = getFirstImage(html, path.relative(ROOT, dir).replace(/\\/g, '/'));

return {
    file,
    title,
    desc,
    date,
    image,
    hasDate,
    mtime: stat.mtimeMs
};
}

function listCategory(cat) {
  const dir = path.join(ROOT, cat.folder);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.warn('! Chưa có thư mục "' + cat.folder + '/" - bỏ qua mục ' + cat.label + '.');
    return { items: [], total: 0, missing: true };
  }
  const files = fs.readdirSync(dir).filter(function (f) {
    return /\.html?$/i.test(f) && !/^index\.html?$/i.test(f) && f[0] !== '_' && f[0] !== '.';
  });
  const items = [];
  for (const f of files) {
    try {
      items.push(readArticle(dir, f));
    } catch (e) {
      console.warn('! Không đọc được ' + cat.folder + '/' + f + ': ' + e.message);
    }
  }
  items.sort(function (a, b) {
    return b.date.ts - a.date.ts || b.mtime - a.mtime || a.file.localeCompare(b.file, 'vi');
  });
  return { items: items, total: items.length, missing: false };
}

function href(cat, file) {
  return cat.folder + '/' + encodeURIComponent(file);
}

function renderCard(cat, a) {
    const url = href(cat, a.file);
    const t = escapeHtml(a.title);
    const img = a.image
        ? '        <a class="news-thumb" href="' + url + '">' +
          '<img src="' + escapeHtml(a.image) + '" alt="' + t + '" loading="lazy">' +
          '</a>\n'
        : '';

    return (
        '      <article class="news-card" data-cat="' + cat.key + '">\n' +
        img +
        '        <div class="news-meta"><span class="tag">' + escapeHtml(cat.label) + '</span>' +
        '<time datetime="' + a.date.iso + '">' + a.date.display + '</time></div>\n' +
        '        <h3><a href="' + url + '">' + t + '</a></h3>\n' +
        (a.desc ? '        <p>' + escapeHtml(a.desc) + '</p>\n' : '') +
        '        <a class="more" href="' + url + '" aria-label="Đọc tiếp: ' + t + '">Đọc tiếp →</a>\n' +
        '      </article>'
    );
}

function renderList(cat, items) {
  if (!items.length) {
    return '      <p class="news-empty">Chưa có bài viết nào trong chuyên mục này. Bài mới sẽ xuất hiện ở đây.</p>';
  }
  return items.map(function (a) { return renderCard(cat, a); }).join('\n');
}

function main() {
  if (!fs.existsSync(PAGE)) {
    console.error('Không tìm thấy ' + path.basename(PAGE) + ' cạnh file tao-danh-sach.js.');
    process.exit(1);
  }
  let page = fs.readFileSync(PAGE, 'utf8');
  const before = page;
  let failed = false;

  for (const cat of CATEGORIES) {
    const start = '<!-- DANH-SACH:' + cat.key + ':START -->';
    const end = '<!-- DANH-SACH:' + cat.key + ':END -->';
    const i = page.indexOf(start);
    const j = page.indexOf(end);
    if (i === -1 || j === -1 || j < i) {
      console.error('Thiếu cặp dấu ' + start + ' ... ' + end + ' trong tin-tuc.html.');
      failed = true;
      continue;
    }
    const res = listCategory(cat);
    const shown = res.items.slice(0, LIMIT);
    const block = start + '\n' + renderList(cat, shown) + '\n';
    page = page.slice(0, i) + block + page.slice(j);

    const noDate = shown.filter(function (a) { return !a.hasDate; }).length;
    console.log('- ' + cat.label.padEnd(10) + ': ' + res.total + ' bài trong ' + cat.folder + '/, hiển thị ' + shown.length +
      (noDate ? ' (' + noDate + ' bài chưa có ngày, đang dùng ngày sửa file)' : ''));
  }

  if (failed) process.exit(1);
  if (page === before) {
    console.log('Không có thay đổi, tin-tuc.html đã mới nhất.');
  } else {
    fs.writeFileSync(PAGE, page, 'utf8');
    console.log('Đã cập nhật tin-tuc.html');
  }
}

main();
