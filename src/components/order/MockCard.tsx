import type { ReactNode } from 'react';

// A pretend card form for local testing when there are no Stripe keys (MOCK_PAYMENTS=true).
// It looks and validates like a real one, but the details never leave the browser: only the outcome
// the test number stands for is sent to the Worker. Test numbers follow Stripe's:
//   4242 4242 4242 4242  succeeds (so does any other valid number)
//   4000 0000 0000 0002  is declined
//   4000 0000 0000 3220  takes a while, to show the waiting screen

export interface MockCardValue {
  number: string;
  expiry: string;
  cvc: string;
  holder: string;
}

export type MockCardField = keyof MockCardValue;
export const EMPTY_CARD: MockCardValue = { number: '', expiry: '', cvc: '', holder: '' };

const digits = (s: string) => s.replace(/\D/g, '');

/** The Luhn checksum every real card number passes. */
function luhn(n: string) {
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    let d = Number(n[n.length - 1 - i]);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

const format: Record<MockCardField, (s: string) => string> = {
  number: (s) => digits(s).slice(0, 19).replace(/(.{4})(?=.)/g, '$1 '),
  expiry: (s) => {
    const d = digits(s).slice(0, 4);
    return d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d;
  },
  cvc: (s) => digits(s).slice(0, 4),
  holder: (s) => s.slice(0, 60),
};

export function cardErrors(v: MockCardValue): Partial<Record<MockCardField, string>> {
  const errors: Partial<Record<MockCardField, string>> = {};
  const n = digits(v.number);
  if (n.length < 13 || !luhn(n)) errors.number = 'Enter a valid card number. For testing, use 4242 4242 4242 4242.';
  const [mm, yy] = v.expiry.split('/').map((s) => Number(digits(s)));
  const now = new Date();
  const expired = !yy || 2000 + yy < now.getFullYear() || (2000 + yy === now.getFullYear() && mm < now.getMonth() + 1);
  if (!mm || mm > 12 || expired) errors.expiry = 'Enter an expiry date in the future, like 12 / 30.';
  if (digits(v.cvc).length < 3) errors.cvc = 'Enter the 3 or 4 digits on the back.';
  if (v.holder.trim().length < 2) errors.holder = 'Enter the name on the card.';
  return errors;
}

/** What the test number stands for. */
export function cardOutcome(v: MockCardValue): 'success' | 'decline' | 'processing' {
  const n = digits(v.number);
  if (n === '4000000000000002') return 'decline';
  if (n === '4000000000003220') return 'processing';
  return 'success';
}

const brand = (n: string) => (/^4/.test(n) ? 'Visa' : /^(5[1-5]|2[2-7])/.test(n) ? 'Mastercard' : /^3[47]/.test(n) ? 'Amex' : '');

interface Props {
  value: MockCardValue;
  errors: Partial<Record<MockCardField, string>>;
  onChange: (value: MockCardValue) => void;
  onBlur: (field: MockCardField) => void;
}

export default function MockCard({ value, errors, onChange, onBlur }: Props) {
  const set = (k: MockCardField) => (e: { target: { value: string } }) => onChange({ ...value, [k]: format[k](e.target.value) });
  const field = (k: MockCardField, label: string, props: Record<string, unknown>, extra = '', after?: ReactNode) => (
    <div className={`field${extra}`}>
      <label className="field__label text-meta" htmlFor={`mc-${k}`}>{label}</label>
      <input
        className="input"
        id={`mc-${k}`}
        value={value[k]}
        onChange={set(k)}
        onBlur={() => onBlur(k)}
        // Off on purpose: this form is pretend, so the browser should not offer a saved real card.
        autoComplete="off"
        aria-invalid={!!errors[k] || undefined}
        aria-describedby={errors[k] ? `mc-${k}-error` : undefined}
        {...props}
      />
      {after}
      {errors[k] && <p className="field__error" id={`mc-${k}-error`}>{errors[k]}</p>}
    </div>
  );
  const b = brand(digits(value.number));

  return (
    <fieldset className="mock-card">
      <legend className="mock-card__legend">
        <span className="field__label text-meta">Card details</span>
        <span className="mock-card__badge text-body-sm">Test mode · no card is charged</span>
      </legend>
      <div className="form-grid">
        {field('number', 'Card number', { inputMode: 'numeric', placeholder: '1234 1234 1234 1234' }, ' field--full mock-card__number', b && <span className="mock-card__brand text-body-sm" aria-hidden="true">{b}</span>)}
        {field('expiry', 'Expiry', { inputMode: 'numeric', placeholder: 'MM / YY' })}
        {field('cvc', 'Security code', { inputMode: 'numeric', placeholder: 'CVC' })}
        {field('holder', 'Name on card', { placeholder: 'As it appears on the card' }, ' field--full')}
      </div>
      <details className="mock-card__help text-body-sm">
        <summary>Test card numbers</summary>
        <ul role="list">
          <li><span className="text-tabular">4242 4242 4242 4242</span>: payment succeeds</li>
          <li><span className="text-tabular">4000 0000 0000 0002</span>: card is declined</li>
          <li><span className="text-tabular">4000 0000 0000 3220</span>: payment takes a while</li>
          <li>Any future expiry date and any 3-digit security code.</li>
        </ul>
      </details>
    </fieldset>
  );
}
