// A tiny element builder for the ordering UI, so text from the basket is always set as text, never as HTML.
type Child = Node | string | number | false | null | undefined;
type Attrs = Record<string, string | number | boolean | undefined | ((e: Event) => void)>;

export function h(tag: string, attrs: Attrs = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== false && c !== null && c !== undefined) el.append(typeof c === 'object' ? c : String(c));
  return el;
}

/** A "− n +" stepper. The buttons carry data-focus ids so focus survives a re-render. */
export function stepper(opts: { name: string; qty: number; id: string; onDec: () => void; onInc: () => void; max: number; small?: boolean }) {
  const { name, qty, id, onDec, onInc, max, small } = opts;
  return h(
    'div',
    { class: `qty${small ? ' qty--small' : ''}`, role: 'group', 'aria-label': `${name} quantity` },
    h('button', { type: 'button', class: 'qty__btn', 'data-focus': `dec:${id}`, 'aria-label': qty === 1 ? `Remove ${name}` : `One fewer ${name}`, onClick: onDec }, h('span', { 'aria-hidden': 'true' }, '−')),
    h('output', { class: 'qty__value text-tabular', 'aria-live': 'polite', 'aria-label': `${qty} ${name} in basket` }, qty),
    h('button', { type: 'button', class: 'qty__btn', 'data-focus': `inc:${id}`, 'aria-label': `One more ${name}`, disabled: qty >= max, onClick: onInc }, h('span', { 'aria-hidden': 'true' }, '+')),
  );
}

/** Re-renders an element's children and puts focus back on the control that had it, by its data-focus id. */
export function rerender(el: HTMLElement, build: () => Node[], fallback?: () => HTMLElement | null) {
  const active = document.activeElement as HTMLElement | null;
  const had = active && el.contains(active) ? active.dataset.focus : undefined;
  el.replaceChildren(...build());
  if (!had) return;
  const again = el.querySelector<HTMLElement>(`[data-focus="${CSS.escape(had)}"]`);
  (again && !(again as HTMLButtonElement).disabled ? again : fallback?.())?.focus();
}

export const isDesktop = () => matchMedia('(min-width: 768px)').matches;
