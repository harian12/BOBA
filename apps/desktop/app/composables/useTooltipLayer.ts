import { onMounted, onUnmounted } from 'vue';

type Side = 'top' | 'bottom' | 'left' | 'right';

const OPEN_DELAY = 350;
const SWITCH_DELAY = 60;
const EDGE = 8;
const GAP = 8;
const sides: Side[] = ['top', 'bottom', 'left', 'right'];

function isSide(value: string | null): value is Side {
  return value !== null && (sides as string[]).includes(value);
}

export function useTooltipLayer() {
  let root: HTMLDivElement | null = null;
  let label: HTMLDivElement | null = null;
  let target: HTMLElement | null = null;
  let openTimer: number | undefined;
  let rafId = 0;
  let keyboardFocus = false;

  const clearTimer = () => {
    if (openTimer !== undefined) {
      window.clearTimeout(openTimer);
      openTimer = undefined;
    }
  };

  function hide() {
    clearTimer();
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (root) root.style.visibility = 'hidden';
    target?.removeAttribute('aria-describedby');
    target = null;
    keyboardFocus = false;
  }

  function resolve(from: EventTarget | null): HTMLElement | null {
    if (!(from instanceof Element)) return null;
    const el = from.closest<HTMLElement>('[data-tip],[title]');
    if (!el || !el.isConnected) return null;
    if (root && root.contains(el)) return null;
    if (el.dataset.tip === '' || el.hasAttribute('data-no-tip')) return null;
    return el;
  }

  /* `title` is moved to `data-tip` instead of being dropped, so the element keeps
     matching [data-tip] on later hovers and on keyboard focus. */
  function readLabel(el: HTMLElement): string {
    const native = el.getAttribute('title');
    if (native !== null) {
      el.dataset.tip = native;
      el.removeAttribute('title');
    }
    return (el.dataset.tip ?? '').trim();
  }

  function place() {
    if (!root || !label || !target) return;
    const rect = target.getBoundingClientRect();
    const box = root.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const rawSide = target.dataset.tipSide ?? null;
    const preferred: Side = isSide(rawSide) ? rawSide : 'top';
    const nowrap = target.dataset.tipNowrap !== undefined;
    label.style.whiteSpace = nowrap ? 'pre' : 'pre-line';

    const fits = (side: Side) => {
      if (side === 'top') return rect.top - box.height - GAP >= EDGE;
      if (side === 'bottom') return rect.bottom + box.height + GAP <= vh - EDGE;
      if (side === 'left') return rect.left - box.width - GAP >= EDGE;
      return rect.right + box.width + GAP <= vw - EDGE;
    };

    const order: Side[] = [preferred, ...sides.filter((s) => s !== preferred)];
    const side = order.find(fits) ?? preferred;

    let left: number;
    let top: number;
    if (side === 'top' || side === 'bottom') {
      left = rect.left + rect.width / 2 - box.width / 2;
      top = side === 'top' ? rect.top - box.height - GAP : rect.bottom + GAP;
    } else {
      left = side === 'left' ? rect.left - box.width - GAP : rect.right + GAP;
      top = rect.top + rect.height / 2 - box.height / 2;
    }

    const maxX = vw - box.width - EDGE;
    const maxY = vh - box.height - EDGE;
    root.style.left = `${Math.round(Math.min(Math.max(left, EDGE), maxX))}px`;
    root.style.top = `${Math.round(Math.min(Math.max(top, EDGE), maxY))}px`;
    root.dataset.side = side;
  }

  function show(el: HTMLElement) {
    if (!root || !label) return;
    const text = readLabel(el);
    if (!text) {
      hide();
      return;
    }
    if (target && target !== el) target.removeAttribute('aria-describedby');

    target = el;
    label.textContent = text;
    root.setAttribute('role', 'tooltip');
    root.removeAttribute('aria-hidden');
    el.setAttribute('aria-describedby', root.id);

    /* Measure before revealing so placement never flashes in the corner. */
    root.style.visibility = 'visible';
    place();

    if (!rafId) {
      const tick = () => {
        if (!target || !target.isConnected) {
          hide();
          return;
        }
        place();
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }
  }

  function schedule(el: HTMLElement, delay: number) {
    clearTimer();
    openTimer = window.setTimeout(() => show(el), delay);
  }

  function onPointerOver(event: Event) {
    const from = event.target;
    /* Moving between children of the element already showing a tooltip. */
    if (target && from instanceof Node && target.contains(from)) return;
    const el = resolve(from);
    if (el === target) return;
    if (!el) {
      if (!keyboardFocus) hide();
      return;
    }
    schedule(el, target ? SWITCH_DELAY : OPEN_DELAY);
  }

  function onPointerOut(event: MouseEvent) {
    const from = event.target;
    if (!target || !(from instanceof Node) || !target.contains(from)) return;
    const related = event.relatedTarget;
    if (related instanceof Node && target.contains(related)) return;
    if (!keyboardFocus) hide();
  }

  function onFocusIn(event: Event) {
    const el = resolve(event.target);
    if (!el) return;
    keyboardFocus = true;
    schedule(el, 0);
  }

  function onFocusOut(event: Event) {
    const from = event.target;
    if (!target || !(from instanceof Node) || !target.contains(from)) return;
    keyboardFocus = false;
    hide();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') hide();
  }

  function onDismiss() {
    hide();
  }

  onMounted(() => {
    root = document.createElement('div');
    root.id = 'boba-tooltip';
    root.className = 'boba-tip';
    root.setAttribute('aria-hidden', 'true');
    label = document.createElement('div');
    label.className = 'boba-tip__label';
    root.append(label);
    document.body.appendChild(root);

    document.addEventListener('mouseover', onPointerOver, true);
    document.addEventListener('mouseout', onPointerOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onDismiss, true);
    document.addEventListener('contextmenu', onDismiss, true);
    window.addEventListener('blur', onDismiss);
    window.addEventListener('scroll', onDismiss, true);
    window.addEventListener('resize', onDismiss);
  });

  onUnmounted(() => {
    hide();
    document.removeEventListener('mouseover', onPointerOver, true);
    document.removeEventListener('mouseout', onPointerOut, true);
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('focusout', onFocusOut, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('mousedown', onDismiss, true);
    document.removeEventListener('contextmenu', onDismiss, true);
    window.removeEventListener('blur', onDismiss);
    window.removeEventListener('scroll', onDismiss, true);
    window.removeEventListener('resize', onDismiss);
    root?.remove();
    root = null;
  });

  return { hide };
}
