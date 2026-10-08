const links = [
  ['Home', '/'],
  ['Map', '/map/'],
  ['Bear', '/bear/'],
  ['Calculator', '/calculator/'],
];

const canonicalPath = (path) => {
  if (path.startsWith('/map/')) return '/map/';
  if (path.startsWith('/bear/')) return '/bear/';
  if (path.startsWith('/calculator/')) return '/calculator/';
  return '/';
};

class ToolNavigation extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;

    const currentPath = canonicalPath(window.location.pathname);
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        position: relative;
        z-index: 1000;
        box-sizing: border-box;
        width: 100%;
        color-scheme: dark;
        font: 600 0.95rem/1.4 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      nav {
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 0.65rem 1rem;
        background: #111827;
        border-bottom: 1px solid #374151;
      }
      ul {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.25rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      a {
        display: block;
        padding: 0.45rem 0.75rem;
        border-radius: 0.45rem;
        color: #dbeafe;
        text-decoration: none;
        white-space: nowrap;
      }
      a:hover {
        background: #1f2937;
        color: #fff;
      }
      a[aria-current="page"] {
        background: #2563eb;
        color: #fff;
      }
      a:focus-visible {
        outline: 3px solid #fbbf24;
        outline-offset: 2px;
      }
      @media (max-width: 32rem) {
        nav {
          padding-inline: 0.5rem;
        }
        ul {
          width: 100%;
        }
        li {
          flex: 1 1 40%;
        }
        a {
          text-align: center;
        }
      }
    `;

    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Kingshot tools');
    const list = document.createElement('ul');
    for (const [label, href] of links) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      if (href === currentPath) link.setAttribute('aria-current', 'page');
      item.append(link);
      list.append(item);
    }
    nav.append(list);
    root.append(style, nav);
  }
}

customElements.define('tool-navigation', ToolNavigation);

if (!document.querySelector('tool-navigation')) {
  const navigation = document.createElement('tool-navigation');
  document.body.prepend(navigation);
}
