// Online ordering settings, shared by the site and the ordering Worker (worker/index.ts), so the
// checkout page and the server always agree on times, fees and the delivery area.
// Money is in cents. Times are minutes after midnight, Sydney time.

export interface Suburb {
  name: string;
  postcode: string;
}

export const ordering = {
  timeZone: 'Australia/Sydney',
  /**
   * Kitchen hours for online orders by weekday, 0 = Sunday: [open, close].
   * Taken from the opening hours in site.json, which the restaurant still has to confirm.
   */
  hours: {
    0: [11 * 60, 22 * 60],
    1: [11 * 60, 22 * 60],
    2: [11 * 60, 22 * 60],
    3: [11 * 60, 22 * 60],
    4: [11 * 60, 22 * 60],
    5: [11 * 60, 23 * 60],
    6: [11 * 60, 23 * 60],
  } as Record<number, [number, number]>,
  /** The earliest pickup is this long after the order is placed. */
  prepMinutes: 20,
  /** Pickup and delivery times are offered in steps of this many minutes. */
  slotMinutes: 15,
  /** The last slot of the day is this long before closing. */
  lastSlotBeforeClose: 30,
  /** How many days ahead, today included, a customer can choose a time. */
  daysAhead: 2,
  maxQtyPerLine: 20,
  /** Carts left untouched this long are emptied. */
  cartExpiryDays: 7,
  delivery: {
    feeCents: 699,
    /** Smallest food subtotal we deliver, before the delivery fee. */
    minCents: 3500,
    /** Added on top of prep time for the drive. */
    extraMinutes: 25,
    suburbs: [
      { name: 'Harris Park', postcode: '2150' },
      { name: 'Parramatta', postcode: '2150' },
      { name: 'Rosehill', postcode: '2142' },
      { name: 'Granville', postcode: '2142' },
      { name: 'Clyde', postcode: '2142' },
      { name: 'Holroyd', postcode: '2142' },
      { name: 'North Parramatta', postcode: '2151' },
      { name: 'Westmead', postcode: '2145' },
      { name: 'Wentworthville', postcode: '2145' },
      { name: 'Merrylands', postcode: '2160' },
    ] as Suburb[],
  },
};

export type FulfilmentType = 'pickup' | 'delivery';
