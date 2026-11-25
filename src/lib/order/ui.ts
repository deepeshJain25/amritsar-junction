// Ordering on every page: the basket badge in the header, Add buttons and steppers on menu cards,
// the choice sheet for dishes with sizes or styles, the "added" toast and the cart drawer.
import { ordering } from '../../content/ordering';
import { money, type VariantGroup } from './catalog';
import * as cart from './cart';
import { h, isDesktop, rerender, stepper } from './dom';
import { track } from './track';
import { mountCartView } from './view';

interface CardItem {
  sku: string;
  name: string;
  price: number;
  variants?: VariantGroup[];
}

const drawer = document.querySelector<HTMLDialogElement>('#cart-drawer');
const sheet = document.querySelector<HTMLDialogElement>('#variant-sheet');
const toast = document.querySelector<HTMLElement>('[data-order-toast]');

/* Header badge */

function updateBadges(c: cart.Cart) {
  const n = cart.count(c);
  document.querySelectorAll<HTMLElement>('[data-cart-count]').forEach((el) => {
    el.textContent = String(n);
    el.hidden = n === 0;
  });
  document.querySelectorAll<HTMLElement>('[data-cart-button]').forEach((el) => {
    el.setAttribute('aria-label', n ? `Basket, ${n} ${n === 1 ? 'item' : 'items'}` : 'Basket, empty');
  });
}

/* Drawer (768px and up); smaller screens go to /cart, a full page. */

let unmountDrawer: (() => void) | undefined;
let lastTrigger: HTMLElement | null = null;

function openBasket(trigger?: HTMLElement | null) {
  if (!drawer || !isDesktop() || location.pathname.startsWith('/cart') || location.pathname.startsWith('/checkout')) {
    location.href = '/cart';
    return;
  }
  lastTrigger = trigger ?? null;
  const body = drawer.querySelector<HTMLElement>('[data-cart-view]')!;
  unmountDrawer?.();
  unmountDrawer = mountCartView(body, { onBrowse: () => drawer.close() });
  drawer.showModal();
  track('cart_opened', { surface: 'drawer' });
}

drawer?.addEventListener('close', () => {
  unmountDrawer?.();
  unmountDrawer = undefined;
  lastTrigger?.focus();
});
drawer?.querySelector('[data-cart-close]')?.addEventListener('click', () => drawer.close());
drawer?.addEventListener('click', (e) => { if (e.target === drawer) drawer.close(); });

document.addEventListener('click', (e) => {
  const button = (e.target as HTMLElement).closest<HTMLElement>('[data-cart-button], [data-cart-open]');
  if (!button) return;
  if (isDesktop() && drawer && !location.pathname.startsWith('/cart') && !location.pathname.startsWith('/checkout')) {
    e.preventDefault();
    openBasket(button);
  }
});

/* Toast */

let toastTimer: ReturnType<typeof setTimeout> | undefined;
const hideToast = () => toast?.classList.remove('is-shown');
// Hovering or tabbing into the toast keeps it up; leaving lets it go.
toast?.addEventListener('pointerenter', () => clearTimeout(toastTimer));
toast?.addEventListener('focusin', () => clearTimeout(toastTimer));
toast?.addEventListener('pointerleave', () => (toastTimer = setTimeout(hideToast, 2000)));
toast?.addEventListener('focusout', () => (toastTimer = setTimeout(hideToast, 2000)));

function showToast(text: string) {
  if (!toast) return;
  clearTimeout(toastTimer);
  toast.replaceChildren(
    h('span', {}, text),
    h('a', { class: 'order-toast__link', href: '/cart', 'data-cart-open': true }, 'View basket'),
  );
  toast.classList.add('is-shown');
  toastTimer = setTimeout(hideToast, 4000);
}

function added(item: CardItem, labels: string[], qty: number, unitPrice: number) {
  showToast(`${item.name}${labels.length ? ` (${labels.join(', ')})` : ''} added`);
  track('cart_item_added', { sku: item.sku, variant: labels.join(' / ') || undefined, qty, unit_price: unitPrice / 100 });
}

/* Choice sheet: sizes and styles, quantity and a note, then "Add to basket · $x". */

function openSheet(item: CardItem, trigger: HTMLElement) {
  if (!sheet) return;
  const groups = item.variants ?? [];
  const chosen: (string | undefined)[] = groups.map(() => undefined);
  let qty = 1;

  const priceOf = () => {
    let p = item.price;
    groups.forEach((g, i) => {
      const o = g.options.find((o) => o.label === chosen[i]);
      if (o?.price !== undefined) p = o.price;
    });
    return p;
  };
  const submit = h('button', { type: 'submit', class: 'btn btn--primary variant-sheet__submit' }) as HTMLButtonElement;
  const qtyHost = h('div', { class: 'variant-sheet__qty' });
  const note = h('textarea', { class: 'input', id: 'variant-note', rows: 2, maxlength: 140, placeholder: 'Extra chutney, less spicy…' }) as HTMLTextAreaElement;

  const refresh = () => {
    const missing = groups.find((_, i) => !chosen[i]);
    submit.disabled = !!missing;
    submit.textContent = missing ? `Choose a ${missing.name.toLowerCase()}` : `Add to basket · ${money(priceOf() * qty)}`;
    rerender(qtyHost, () => [
      h('span', { class: 'field__label text-meta' }, 'Quantity'),
      stepper({ name: item.name, qty, id: 'sheet', max: ordering.maxQtyPerLine, onDec: () => { qty = Math.max(1, qty - 1); refresh(); }, onInc: () => { qty += 1; refresh(); } }),
    ]);
    qtyHost.querySelector<HTMLButtonElement>('[data-focus="dec:sheet"]')!.disabled = qty <= 1;
  };

  const fieldsets = groups.map((g, gi) =>
    h(
      'fieldset',
      { class: 'variant-sheet__group' },
      h('legend', { class: 'field__label text-meta' }, g.name === 'Size' ? 'Choose a size' : 'Choose a style'),
      ...g.options.map((o) =>
        h(
          'label',
          { class: 'variant-option' },
          h('input', { type: 'radio', name: `variant-${gi}`, value: o.label, required: true, onChange: () => { chosen[gi] = o.label; refresh(); } }),
          h('span', { class: 'variant-option__label' }, o.label),
          h('span', { class: 'variant-option__price text-tabular' }, money(o.price ?? item.price)),
        ),
      ),
    ),
  );

  const form = h(
    'form',
    {
      class: 'variant-sheet__form',
      method: 'dialog',
      onSubmit: (e: Event) => {
        e.preventDefault();
        if (submit.disabled) return;
        const labels = chosen as string[];
        const unitPrice = priceOf();
        cart.add({ sku: item.sku, name: item.name, variantLabels: labels, unitPrice, note: note.value.trim() || undefined }, qty);
        sheet.close();
        added(item, labels, qty, unitPrice);
      },
    },
    h('div', { class: 'variant-sheet__head' }, h('h2', { class: 'text-heading-md', id: 'variant-title' }, item.name), h('button', { type: 'button', class: 'variant-sheet__close', 'aria-label': 'Close', onClick: () => sheet.close() }, h('span', { 'aria-hidden': 'true' }, '×'))),
    h('div', { class: 'variant-sheet__body' }, ...fieldsets, qtyHost, h('div', { class: 'field' }, h('label', { class: 'field__label text-meta', for: 'variant-note' }, 'Note for the kitchen', h('span', { class: 'field__optional' }, ' (optional)')), note)),
    h('div', { class: 'variant-sheet__foot' }, submit),
  );

  sheet.replaceChildren(form);
  refresh();
  // Adding turns the card's Add button into a stepper, so focus returns to the stepper's "+" instead.
  sheet.onclose = () => (trigger.isConnected ? trigger : cards.find((c) => c.item.sku === item.sku)?.el.querySelector<HTMLElement>('button:last-of-type'))?.focus();
  sheet.showModal();
  sheet.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
}

sheet?.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });

/* Menu cards: "+ Add" until the dish is in the basket, then a stepper. */

const cards = [...document.querySelectorAll<HTMLElement>('[data-order-item]')].map((el) => ({ el, item: JSON.parse(el.dataset.orderItem!) as CardItem }));

function addOne(item: CardItem, trigger: HTMLElement) {
  if (item.variants?.length) return openSheet(item, trigger);
  cart.add({ sku: item.sku, name: item.name, variantLabels: [], unitPrice: item.price });
  added(item, [], 1, item.price);
}

function renderCard({ el, item }: (typeof cards)[number], c: cart.Cart) {
  const qty = cart.qtyOf(item.sku, c);
  const shown = el.dataset.qty ?? '0';
  if (String(qty) === shown) return;
  el.dataset.qty = String(qty);
  rerender(
    el,
    () =>
      qty === 0
        ? [h('button', { type: 'button', class: 'btn btn--secondary order-add', 'data-focus': `inc:${item.sku}`, onClick: (e: Event) => addOne(item, e.currentTarget as HTMLElement) }, h('span', { 'aria-hidden': 'true' }, '+'), ' Add', h('span', { class: 'sr-only' }, ` ${item.name}`))]
        : [
            stepper({
              name: item.name,
              qty,
              id: item.sku,
              max: item.variants?.length ? Infinity : ordering.maxQtyPerLine,
              onDec: () => { cart.removeOne(item.sku); track('cart_item_removed', { sku: item.sku }); },
              onInc: () => addOne(item, el.querySelector<HTMLElement>(`[data-focus="inc:${CSS.escape(item.sku)}"]`)!),
            }),
          ],
    () => el.querySelector<HTMLElement>('button'),
  );
}

// Server-rendered Add buttons work from the first click, before the cards are re-rendered.
document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-order-add]');
  if (!btn) return;
  const card = cards.find((c) => c.el.contains(btn));
  if (card) addOne(card.item, btn);
});

function renderAll(c: cart.Cart) {
  updateBadges(c);
  cards.forEach((card) => renderCard(card, c));
}

renderAll(cart.getCart());
cart.subscribe(renderAll);
