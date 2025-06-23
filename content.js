const BLOCKED_KEYWORDS = [
  "pride", "gay", "lesbian", "lgbt", "lgbtq", "lgbtqia", "queer",
  "transgender", "trans", "transsexual", "bisexual", "homosexual", "nonbinary", "non-binary",
  "pansexual", "asexual", "intersex", "genderfluid", "genderqueer", "agender",
  "bigender", "demiboy", "demigirl", "demisexual", "androgyne", "genderflux",
  "genderfae", "genderneutral", "neutrois", "omnisexual", "polysexual",
  "skoliosexual", "sapiosexual"
];

const SKIP_TAGS = new Set([
  "html", "head", "body", "script", "style", "noscript", "iframe", "meta", "link", "title"
]);

const keywordPattern = BLOCKED_KEYWORDS
  .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');
const blockedRegex = new RegExp(`\\b(${keywordPattern})\\b`, 'i');
const blockedRegexGlobal = new RegExp(`\\b(${keywordPattern})\\b`, 'gi');

function hasBlockedKeyword(text) {
  return text && blockedRegex.test(text.toLowerCase());
}

function shouldRemove(el) {
  const tag = el.tagName?.toLowerCase();
  if (!tag || SKIP_TAGS.has(tag)) return false;

  if (el.classList) {
    for (const cls of el.classList) {
      if (hasBlockedKeyword(cls)) return true;
    }
  } else if (el.className && hasBlockedKeyword(el.className)) {
    return true;
  }

  return false;
}

function isEditable(node) {
  if (!node.parentElement) return false;
  const parent = node.parentElement;
  return (
    parent.tagName === "TEXTAREA" ||
    (parent.tagName === "INPUT" && /text|search|email|url|tel/.test(parent.type)) ||
    parent.isContentEditable
  );
}

function removeBlockedElements(root) {
  const candidates = root.querySelectorAll('*[class]');
  candidates.forEach(el => {
    try {
      if (shouldRemove(el)) el.remove();
    } catch {}
  });
}

function censorBlockedText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (isEditable(node)) return NodeFilter.FILTER_REJECT;
      return hasBlockedKeyword(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  let node;
  while (node = walker.nextNode()) {
    try {
      node.nodeValue = node.nodeValue.replace(blockedRegexGlobal, '[removed]');
    } catch {}
  }
}

function getDomain() {
  try {
    return location.hostname;
  } catch {
    return null;
  }
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

let lastDomain = null;
let isWhitelisted = false;
let isContextValid = true;

window.addEventListener('beforeunload', () => {
  isContextValid = false;
});

function runFilter(root = document.body) {
  if (!isContextValid) return;

  if (!root) return;
  const domain = getDomain();
  if (!domain) return;

  if (domain !== lastDomain) {
    lastDomain = domain;

    chrome.storage.local.get('whitelistedSites', (result) => {
      if (chrome.runtime.lastError || !isContextValid) {
        return;
      }
      const list = result.whitelistedSites || [];
      isWhitelisted = list.includes(domain);

      if (!isWhitelisted && isContextValid && document.body) {
        try {
          removeBlockedElements(document.body);
          censorBlockedText(document.body);
        } catch (err) {
          console.warn('Error running filter:', err);
        }
      }
    });
    return;
  }

  if (isWhitelisted) return;

  try {
    removeBlockedElements(root);
    censorBlockedText(root);
  } catch (err) {
    console.warn('Error running filter:', err);
  }
}

const debouncedRunFilter = debounce(runFilter, 1500);

function observeMutations() {
  const observer = new MutationObserver(mutations => {
    const rootsToFilter = new Set();

    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          rootsToFilter.add(node);
        }
      });
    }

    rootsToFilter.forEach(root => {
      debouncedRunFilter(root);
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    runFilter();
    observeMutations();
  });
} else {
  runFilter();
  observeMutations();
}

(function() {
  let lastUrl = location.href;

  function onUrlChange() {
    lastDomain = null;
    runFilter();
  }

  const pushStateOrig = history.pushState;
  history.pushState = function(...args) {
    pushStateOrig.apply(this, args);
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onUrlChange();
    }
  };

  const replaceStateOrig = history.replaceState;
  history.replaceState = function(...args) {
    replaceStateOrig.apply(this, args);
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onUrlChange();
    }
  };

  window.addEventListener('popstate', () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onUrlChange();
    }
  });

  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      onUrlChange();
    }
  }, 1000);
})();
