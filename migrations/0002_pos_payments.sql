-- Card payments now go through the POS, which owns the Stripe account. The Worker keeps the PaymentIntent's
-- client secret so it can read the payment's state from Stripe with the publishable key.
ALTER TABLE orders ADD COLUMN payment_client_secret TEXT;
