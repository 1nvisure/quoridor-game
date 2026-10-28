/**
 * jsdom environment for the UI tests.
 *
 * Import this module *first*: framer-motion and React read globals at module
 * load time, so the DOM has to exist before they are imported.
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:3000',
  pretendToBeVisual: true,
});

const g = globalThis as any;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.SVGElement = dom.window.SVGElement;
g.Event = dom.window.Event;
g.KeyboardEvent = dom.window.KeyboardEvent;
g.MouseEvent = dom.window.MouseEvent;
g.getComputedStyle = dom.window.getComputedStyle;
// Keep jsdom's native rAF (pretendToBeVisual) — framer-motion's ticker relies on it.
g.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
g.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
g.IS_REACT_ACT_ENVIRONMENT = true;

if (!dom.window.matchMedia) {
  dom.window.matchMedia = ((q: string) => ({
    matches: /reduce/i.test(q), media: q, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as any;
}
g.matchMedia = dom.window.matchMedia;

class RO { observe() {} unobserve() {} disconnect() {} }
g.ResizeObserver = RO;
(dom.window as any).ResizeObserver = RO;
class IO { observe() {} unobserve() {} disconnect() {} }
g.IntersectionObserver = IO;

// framer-motion creates AbortController signals and hands them to addEventListener;
// jsdom only accepts its own AbortSignal implementation.
g.AbortController = dom.window.AbortController;
g.AbortSignal = dom.window.AbortSignal;
(dom.window as any).AbortController = dom.window.AbortController;
