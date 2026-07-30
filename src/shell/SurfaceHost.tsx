// SurfaceHost — Figma `shell/SurfaceHost · SPEC`, node 20:8. DONOR SurfaceHost.tsx.
//
// FIGMA SPEC (verbatim substance): "NOT A VISUAL COMPONENT — this card exists so the roster is
// complete and nobody 'designs' it. Kept-alive: mount on first activation, never unmount. Hide
// with visibility:hidden + inert + aria-hidden. NEVER display:none — it drops layout and resets
// inner scroll offsets. Never add app/template.tsx; it remounts per navigation."
//
// The Figma node is a dashed card reading "SurfaceHost — no pixels". That is deliberate: the
// roster is complete, so nobody opens the file, finds a hole where the middle region should be,
// and designs one.
//
// WHY visibility:hidden AND NOT display:none, spelled out because "it's hidden either way" is the
// exact reasoning that undoes it: display:none removes the element from layout, so every scroll
// container inside it loses its offset and every measured width becomes 0. Come back to a surface
// and you are at the top of a table you had scrolled halfway down, with a virtualizer that just
// measured itself against a zero-width box. visibility:hidden keeps the box and the offsets;
// `inert` keeps the keyboard out; `aria-hidden` keeps the screen reader out.
//
// The last clause is a Next.js one and it is worth carrying even though this tier does not import
// Next: an `app/template.tsx` remounts its subtree on every navigation, which is precisely the
// thing this component exists to prevent. If a consumer adds one, kept-alive silently stops
// working and nothing points at the file that caused it.
//
// PLATFORM-TIER DEVIATIONS from the donor — parameter-or-leak calls:
//  · `usePathname()` + `SURFACES` + `surfaceByPath()` → `surfaces` and `activeId` props. Routing
//    is the app's: a library that resolves a URL to a surface has picked the consumer's router.
//    A Next consumer writes `activeId={surfaceByPath(usePathname())?.id ?? null}`; the mapping
//    stays a one-row registry in the app, exactly as the donor had it.
//  · That also removes the file's only `next/*` import. Nothing here needs Next at all.

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";

export interface SurfaceDef {
  id: string;
  /** the lazy import — `() => import("@/surfaces/DataSurface")` */
  load: () => Promise<{ default: ComponentType }>;
}

/**
 * Whether the surface reading this is the VISIBLE one.
 *
 * A kept-alive surface is mounted and running whether or not anyone can see it, so anything with a
 * side effect — a subscription, a poll, a region publish — must gate on this. `useConsoleRegions`
 * takes it as its `active` argument for exactly that reason: a hidden surface that republishes
 * overwrites the visible one's chrome.
 */
export const SurfaceActiveContext = createContext(true);

export function useSurfaceActive(): boolean {
  return useContext(SurfaceActiveContext);
}

// module-level, not state: a surface's component is loaded ONCE per session, and re-mounting the
// host must not re-download it
const loaded = new Map<string, ComponentType>();

function LazySurface({ def }: { def: SurfaceDef }) {
  const [, force] = useState(0);
  const Comp = loaded.get(def.id);
  useEffect(() => {
    if (!loaded.has(def.id)) {
      let alive = true;
      void def.load().then((m) => {
        loaded.set(def.id, m.default);
        if (alive) force((n) => n + 1);
      });
      return () => {
        alive = false;
      };
    }
    return undefined;
  }, [def]);
  return Comp ? <Comp /> : null;
}

export function SurfaceHost({
  surfaces,
  activeId,
  /** the DOM id prefix for each surface's scroll box — `${idPrefix}${surface.id}` */
  idPrefix = "surface-",
}: {
  surfaces: SurfaceDef[];
  activeId: string | null;
  idPrefix?: string;
}) {
  const [mounted, setMounted] = useState<Set<string>>(
    () => new Set(activeId ? [activeId] : []),
  );
  const prevActive = useRef(activeId);

  useEffect(() => {
    if (activeId) {
      setMounted((prev) => (prev.has(activeId) ? prev : new Set(prev).add(activeId)));
    }
    // screen-reader orientation: focus the active surface region on a CHANGE, never on boot —
    // stealing focus at load moves the caret out of whatever the browser restored
    if (prevActive.current !== activeId && activeId) {
      prevActive.current = activeId;
      document.getElementById(`${idPrefix}${activeId}`)?.focus({ preventScroll: true });
    }
  }, [activeId, idPrefix]);

  return (
    <div className="relative h-full min-h-0">
      {surfaces
        .filter((s) => mounted.has(s.id))
        .map((s) => {
          const active = s.id === activeId;
          return (
            <div
              key={s.id}
              id={`${idPrefix}${s.id}`}
              tabIndex={-1}
              className="absolute inset-0 overflow-auto outline-none"
              // visibility, NEVER display — see the header
              style={{ visibility: active ? "visible" : "hidden" }}
              inert={active ? undefined : true}
              aria-hidden={!active}
            >
              <SurfaceActiveContext.Provider value={active}>
                <LazySurface def={s} />
              </SurfaceActiveContext.Provider>
            </div>
          );
        })}
    </div>
  );
}
