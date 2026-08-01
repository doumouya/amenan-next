// A ~30-line React render harness, deliberately NOT @testing-library/react.
//
// package.json declares react, react-dom, jsdom, typescript and vitest — nothing else — and a
// platform tier that grows a test-only dependency to click three buttons has spent a real budget
// (install time, CI surface, a version to keep in step with React) on convenience. `createRoot`
// plus React 19's own `act` is the whole harness, and it is the same API the library itself is
// built on, so nothing here can pass while the real thing is broken.

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

// React refuses to batch updates outside an act environment and warns loudly about it
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Mounted {
  container: HTMLElement;
  rerender: (ui: ReactElement) => Promise<void>;
  unmount: () => Promise<void>;
  /** every button in the tree, in DOM order */
  buttons: () => HTMLButtonElement[];
  /** the first button whose aria-label matches exactly */
  button: (label: string) => HTMLButtonElement;
  click: (el: Element) => Promise<void>;
  /** dispatch a keydown (bubbling, so React's root listener sees it) — for the inline inputs */
  key: (el: Element, key: string) => Promise<void>;
  /** dispatch an arbitrary event inside act — for the rarer gestures (dblclick, pointer) */
  fire: (el: Element, ev: Event) => Promise<void>;
  text: () => string;
}

export async function mount(ui: ReactElement): Promise<Mounted> {
  const container = document.createElement("div");
  document.body.append(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(ui);
  });

  const buttons = () => [...container.querySelectorAll("button")];
  return {
    container,
    buttons,
    button(label) {
      const found = buttons().find((b) => b.getAttribute("aria-label") === label);
      if (!found) {
        throw new Error(
          `no button labelled "${label}"; found: ${buttons()
            .map((b) => b.getAttribute("aria-label"))
            .join(" · ")}`,
        );
      }
      return found;
    },
    async click(el) {
      await act(async () => {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    },
    async key(el, key) {
      await act(async () => {
        el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });
    },
    async fire(el, ev) {
      await act(async () => {
        el.dispatchEvent(ev);
      });
    },
    async rerender(next) {
      await act(async () => {
        root.render(next);
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
    text: () => container.textContent ?? "",
  };
}
