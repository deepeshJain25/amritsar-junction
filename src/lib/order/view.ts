// The basket view, shared by the cart drawer (desktop) and the /cart page: lines with steppers,
// one note for the kitchen, totals and the checkout button, or a welcome when it is empty.
import { ordering } from '../../content/ordering';
import { money } from './catalog';
import * as cart from './cart';
import { h, rerender, stepper } from './dom';

export interface CartViewOptions {
  /** Called by "Add more to the order" and the empty-state link; the drawer closes itself, the page goes to the menu. */
  onBrowse?: () => void;
}

export function mountCartView(root: HTMLElement, opts: CartViewOptions = {}) {
  const notice = h('p', { class: 'cart__notice text-body-sm', role: 'status', hidden: true });
  const heading = h('h2', { class: 'sr-only', tabindex: '-1' }, 'Dishes in your basket');
  const lines = h('ul', { class: 'cart__lines', role: 'list' });
  const note = h('textarea', { class: 'input cart__note', id: `${root.id || 'cart'}-note`, rows: 3, maxlength: 300, placeholder: 'Less spicy, extra chutney, no onion…' }) as HTMLTextAreaElement;
  const totals = h('dl', { class: 'cart__totals' });
  const gst = h('p', { class: 'cart__gst text-body-sm' }, 'Prices include GST.');
  const checkout = h('a', { class: 'btn btn--primary cart__checkout', href: '/checkout' });
  const browse = h('a', { class: 'btn btn--tertiary', href: '/menu', onClick: (e: Event) => { if (opts.onBrowse) { e.preventDefault(); opts.onBrowse(); } } }, 'Add more to the order');

  const full = h(
    'div',
    { class: 'cart' },
    notice,
    heading,
    lines,
    h('div', { class: 'field cart__note-field' }, h('label', { class: 'field__label text-meta', for: note.id }, 'Anything else for the kitchen?'), note),
    h('div', { class: 'cart__sums' }, totals, gst),
    h('div', { class: 'cart__actions' }, checkout, browse),
  );
  const empty = h(
    'div',
    { class: 'cart-empty' },
    h('p', { class: 'text-script cart-empty__welcome' }, h('span', { lang: 'pa' }, 'ਜੀ ਆਇਆਂ ਨੂੰ'), ' · Welcome'),
    h('p', { class: 'text-heading-md' }, 'Your basket is empty. Start with a kulcha.'),
    h('a', { class: 'btn btn--primary', href: '/menu', onClick: (e: Event) => { if (opts.onBrowse) { e.preventDefault(); opts.onBrowse(); } } }, 'Browse the menu'),
  );

  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  note.addEventListener('input', () => {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => cart.setKitchenNote(note.value), 300);
  });

  const lineItem = (l: cart.CartLine) =>
    h(
      'li',
      { class: 'cart-line' },
      h(
        'div',
        { class: 'cart-line__info' },
        h('h3', { class: 'cart-line__name text-heading-sm' }, l.name),
        (l.variantLabels.length > 0 || l.note) && h('p', { class: 'cart-line__meta text-body-sm' }, [...l.variantLabels, l.note && `“${l.note}”`].filter(Boolean).join(' · ')),
        h('p', { class: 'cart-line__unit text-body-sm text-tabular' }, `${money(l.unitPrice)} each`),
      ),
      stepper({ name: l.name, qty: l.qty, id: l.key, max: ordering.maxQtyPerLine, small: true, onDec: () => cart.setQty(l.key, l.qty - 1), onInc: () => cart.setQty(l.key, l.qty + 1) }),
      h('p', { class: 'cart-line__total text-tabular' }, money(l.unitPrice * l.qty)),
      h('button', { type: 'button', class: 'cart-line__remove', 'data-focus': `rm:${l.key}`, 'aria-label': `Remove ${l.name} from basket`, onClick: () => cart.remove(l.key) }, h('span', { 'aria-hidden': 'true' }, '×')),
    );

  function render(c: cart.Cart) {
    if (!c.lines.length) {
      root.replaceChildren(empty);
      return;
    }
    if (!root.contains(full)) root.replaceChildren(full);
    rerender(lines, () => c.lines.map(lineItem), () => heading);
    if (document.activeElement !== note) note.value = c.kitchenNote;
    const sub = cart.subtotal(c);
    totals.replaceChildren(
      h('div', {}, h('dt', {}, 'Subtotal'), h('dd', { class: 'text-tabular' }, money(sub))),
      h('div', { class: 'cart__muted' }, h('dt', {}, 'Delivery'), h('dd', {}, `${money(ordering.delivery.feeCents)} if delivered`)),
      h('div', { class: 'cart__grand' }, h('dt', {}, 'Total'), h('dd', { class: 'text-tabular' }, money(sub))),
    );
    checkout.textContent = `Checkout · ${money(sub)}`;
  }

  render(cart.getCart());
  const off = cart.subscribe(render);

  // Prices can change between visits: bring the basket up to today's menu and say what changed.
  cart
    .loadCatalog()
    .then((catalog) => {
      const { repriced, removed } = cart.revalidate(catalog);
      const parts = [repriced && "We've updated prices to match today's menu.", removed.length > 0 && `${removed.join(', ')} ${removed.length === 1 ? 'is' : 'are'} no longer available and ${removed.length === 1 ? 'was' : 'were'} removed.`].filter(Boolean);
      notice.textContent = parts.join(' ');
      notice.hidden = !parts.length;
    })
    .catch(() => {
      /* offline: the server reprices at checkout anyway */
    });

  return () => off();
}
