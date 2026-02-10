(function () {
  const editor = document.getElementById("firead-editor");
  const clearStylesBtn = document.getElementById("btn-clear-styles");

  if (!editor) return;

  function isUsefulHtml(html) {
    return !!html && /<(p|div|ul|ol|li|table|h1|h2|h3|h4|blockquote|pre|code|img|br)\b/i.test(html);
  }

  function unwrapNode(node) {
    const parent = node.parentNode;
    if (!parent) return;

    while (node.firstChild) {
      parent.insertBefore(node.firstChild, node);
    }

    parent.removeChild(node);
  }

  function sanitizeAndNormalizeHtml(html) {
    const wrap = document.createElement("div");
    wrap.innerHTML = html;

    wrap.querySelectorAll("script,style,iframe,form,svg").forEach((n) => n.remove());

    wrap.querySelectorAll("b").forEach((b) => {
      const strong = document.createElement("strong");
      strong.innerHTML = b.innerHTML;
      b.replaceWith(strong);
    });

    wrap.querySelectorAll("i").forEach((i) => {
      const em = document.createElement("em");
      em.innerHTML = i.innerHTML;
      i.replaceWith(em);
    });

    wrap.querySelectorAll("h1").forEach((h) => {
      const h2 = document.createElement("h2");
      h2.innerHTML = h.innerHTML;
      h.replaceWith(h2);
    });

    wrap.querySelectorAll("h4,h5,h6").forEach((h) => {
      const h3 = document.createElement("h3");
      h3.innerHTML = h.innerHTML;
      h.replaceWith(h3);
    });

    const allowed = new Set([
      "P",
      "DIV",
      "BR",
      "H2",
      "H3",
      "UL",
      "OL",
      "LI",
      "STRONG",
      "EM",
      "CODE",
      "PRE",
      "A",
      "TABLE",
      "THEAD",
      "TBODY",
      "TR",
      "TH",
      "TD",
      "BLOCKQUOTE",
      "HR",
      "IMG",
      "SPAN",
    ]);

    const nodes = Array.from(wrap.querySelectorAll("*"));
    nodes.forEach((el) => {
      if (!allowed.has(el.tagName)) {
        unwrapNode(el);
        return;
      }

      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (
          name.startsWith("on") ||
          name === "style" ||
          name === "class" ||
          name === "id" ||
          name.startsWith("data-")
        ) {
          el.removeAttribute(attr.name);
        }
      });

      if (el.tagName === "A") {
        const href = el.getAttribute("href") || "";
        if (!/^https?:\/\//i.test(href)) {
          el.removeAttribute("href");
          el.removeAttribute("target");
          el.removeAttribute("rel");
        } else {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noreferrer");
        }
      }

      if (el.tagName === "IMG") {
        const src = el.getAttribute("src") || "";
        if (!/^(https?:\/\/|data:image\/)/i.test(src)) {
          el.remove();
        }
      }
    });

    wrap.querySelectorAll("div").forEach((d) => {
      const hasProtectedBlock = d.querySelector("ul,ol,table,h2,h3,pre,blockquote");
      if (!hasProtectedBlock) {
        const p = document.createElement("p");
        p.innerHTML = d.innerHTML;
        d.replaceWith(p);
      }
    });

    wrap.querySelectorAll("p").forEach((p) => {
      const rawHtml = p.innerHTML;
      if (/(<br\s*\/>\s*){2,}/i.test(rawHtml)) {
        const pieces = rawHtml
          .split(/(?:<br\s*\/>\s*){2,}/i)
          .map((part) => part.trim())
          .filter(Boolean);

        if (pieces.length > 1) {
          const fragment = document.createDocumentFragment();
          pieces.forEach((part) => {
            const newP = document.createElement("p");
            newP.innerHTML = part;
            fragment.appendChild(newP);
          });
          p.replaceWith(fragment);
        }
      }
    });

    const topNodes = Array.from(wrap.childNodes);
    topNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent && node.textContent.trim()) {
        const p = document.createElement("p");
        p.textContent = node.textContent.trim();
        node.replaceWith(p);
      }
    });

    wrap.querySelectorAll("p").forEach((p) => {
      if (!p.textContent.trim() && !p.querySelector("img,table")) {
        p.remove();
      }
    });

    return wrap.innerHTML.trim();
  }

  function plainTextToBasicHtml(text) {
    if (!text) return "<p></p>";

    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    let paragraphLines = [];
    let listType = null;
    let listItems = [];

    const flushParagraph = () => {
      if (!paragraphLines.length) return;
      const paragraph = paragraphLines.join(" ").trim();
      if (paragraph) {
        blocks.push(`<p>${escapeHtml(paragraph)}</p>`);
      }
      paragraphLines = [];
    };

    const flushList = () => {
      if (!listType || !listItems.length) return;
      const tag = listType === "ul" ? "ul" : "ol";
      const items = listItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
      blocks.push(`<${tag}>${items}</${tag}>`);
      listType = null;
      listItems = [];
    };

    lines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) {
        flushParagraph();
        flushList();
        return;
      }

      const ulMatch = line.match(/^[-•]\s+(.+)$/);
      const olMatch = line.match(/^\d+[.)]\s+(.+)$/);

      if (ulMatch) {
        flushParagraph();
        if (listType && listType !== "ul") {
          flushList();
        }
        listType = "ul";
        listItems.push(ulMatch[1]);
        return;
      }

      if (olMatch) {
        flushParagraph();
        if (listType && listType !== "ol") {
          flushList();
        }
        listType = "ol";
        listItems.push(olMatch[1]);
        return;
      }

      flushList();
      paragraphLines.push(line);
    });

    flushParagraph();
    flushList();

    return blocks.join("") || "<p></p>";
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
  }

  function insertHtmlAtCursor(html) {
    if (!html) return;

    editor.focus();

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      editor.insertAdjacentHTML("beforeend", html);
      return;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const fragment = range.createContextualFragment(html);
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);

    if (lastNode) {
      const newRange = document.createRange();
      newRange.setStartAfter(lastNode);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);
    }
  }

  function cleanStylesInElement(root) {
    const targets = root.querySelectorAll("*");

    targets.forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (
          name === "style" ||
          name === "class" ||
          name === "id" ||
          name.startsWith("on") ||
          name.startsWith("data-")
        ) {
          el.removeAttribute(attr.name);
        }
      });

      if (el.tagName === "A") {
        const href = el.getAttribute("href") || "";
        if (/^https?:\/\//i.test(href)) {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noreferrer");
        } else {
          el.removeAttribute("href");
          el.removeAttribute("target");
          el.removeAttribute("rel");
        }
      }
    });
  }

  function getSelectedFragmentWithinEditor() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const commonAncestor = range.commonAncestorContainer;
    const insideEditor = commonAncestor === editor || editor.contains(commonAncestor);

    if (!insideEditor) {
      return null;
    }

    return { selection, range };
  }

  editor.addEventListener("paste", (e) => {
    const html = e.clipboardData?.getData("text/html")?.trim();
    const text = e.clipboardData?.getData("text/plain")?.trim();

    if (isUsefulHtml(html)) {
      e.preventDefault();
      const clean = sanitizeAndNormalizeHtml(html);
      insertHtmlAtCursor(clean);
      return;
    }

    e.preventDefault();
    const blocksHtml = plainTextToBasicHtml(text || "");
    insertHtmlAtCursor(blocksHtml);
  });

  if (clearStylesBtn) {
    clearStylesBtn.addEventListener("click", () => {
      const selectionInfo = getSelectedFragmentWithinEditor();

      if (selectionInfo) {
        const { selection, range } = selectionInfo;
        const container = document.createElement("div");
        container.appendChild(range.cloneContents());
        cleanStylesInElement(container);
        range.deleteContents();
        const fragment = document.createRange().createContextualFragment(container.innerHTML);
        range.insertNode(fragment);
        selection.removeAllRanges();
        return;
      }

      cleanStylesInElement(editor);
    });
  }
})();
