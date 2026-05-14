require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Health check ──
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── Create PaymentIntent for security deposit ──
// Called when tenant hits "Pay $5,000 Deposit"
app.post('/create-deposit-intent', async (req, res) => {
  try {
    const { tenantName, tenantEmail, paymentMethodType } = req.body;

    const intent = await stripe.paymentIntents.create({
      amount: 500000, // $5,000.00 in cents
      currency: 'usd',
      payment_method_types: paymentMethodType === 'us_bank_account'
        ? ['us_bank_account']
        : ['card'],
      metadata: {
        type: 'security_deposit',
        property: '806 Boscobel Street, Nashville TN 37206',
        tenant_name: tenantName,
        tenant_email: tenantEmail,
        lease_term: 'June 1 – July 31, 2026',
      },
      description: 'Security Deposit — 806 Boscobel St, Nashville TN 37206',
      receipt_email: tenantEmail,
    });

    res.json({ clientSecret: intent.client_secret });
  } catch (err) {
    console.error('Deposit intent error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Create SetupIntent for rent autopay ──
// Saves the payment method for future recurring charges
app.post('/create-setup-intent', async (req, res) => {
  try {
    const { tenantName, tenantEmail, paymentMethodType } = req.body;

    // Create or retrieve a Stripe Customer
    const customers = await stripe.customers.list({ email: tenantEmail, limit: 1 });
    let customer;
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        name: tenantName,
        email: tenantEmail,
        metadata: {
          property: '806 Boscobel Street, Nashville TN 37206',
          lease_term: 'June 1 – July 31, 2026',
        },
      });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: paymentMethodType === 'us_bank_account'
        ? ['us_bank_account']
        : ['card'],
      metadata: {
        type: 'rent_autopay',
        tenant_name: tenantName,
        tenant_email: tenantEmail,
      },
      usage: 'off_session', // allows future charges without tenant present
    });

    res.json({
      clientSecret: setupIntent.client_secret,
      customerId: customer.id,
    });
  } catch (err) {
    console.error('Setup intent error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Schedule autopay charges ──
// Called after SetupIntent confirmed — schedules both rent payments
app.post('/schedule-autopay', async (req, res) => {
  try {
    const { customerId, paymentMethodId, tenantEmail } = req.body;

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    // Create two scheduled charges via PaymentIntents with future dates
    // Month 1: June 1 2026 — $4,766.67 (with blackout credit)
    // Month 2: July 1 2026 — $5,500.00 (full month)
    // NOTE: Stripe doesn't natively schedule PaymentIntents by date.
    // We use Stripe Subscriptions with a one-off price, or store and
    // charge via a cron job. For simplicity here we create both intents
    // as off_session and confirm them — in production use a scheduler.

    const charge1 = await stripe.paymentIntents.create({
      amount: 476667, // $4,766.67 in cents
      currency: 'usd',
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: false, // Set to true on June 1 via your scheduler/cron
      metadata: {
        type: 'rent_month_1',
        due_date: '2026-06-01',
        note: 'June rent incl. 4-day blackout credit ($733.33)',
        property: '806 Boscobel Street, Nashville TN 37206',
      },
      description: 'Month 1 Rent (June 2026) — 806 Boscobel St',
      receipt_email: tenantEmail,
    });

    const charge2 = await stripe.paymentIntents.create({
      amount: 550000, // $5,500.00 in cents
      currency: 'usd',
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: false, // Set to true on July 1 via your scheduler/cron
      metadata: {
        type: 'rent_month_2',
        due_date: '2026-07-01',
        note: 'July rent — full month',
        property: '806 Boscobel Street, Nashville TN 37206',
      },
      description: 'Month 2 Rent (July 2026) — 806 Boscobel St',
      receipt_email: tenantEmail,
    });

    res.json({
      success: true,
      month1IntentId: charge1.id,
      month2IntentId: charge2.id,
      message: 'Autopay scheduled. Charge IDs saved — confirm on due dates.',
    });
  } catch (err) {
    console.error('Autopay schedule error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Stripe webhook (optional but recommended) ──
// Verifies payment events — set up in Stripe dashboard
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      console.log('Payment succeeded:', event.data.object.id, event.data.object.metadata);
      break;
    case 'payment_intent.payment_failed':
      console.log('Payment FAILED:', event.data.object.id);
      break;
    case 'setup_intent.succeeded':
      console.log('SetupIntent succeeded — autopay method saved:', event.data.object.id);
      break;
    default:
      console.log('Webhook event:', event.type);
  }

  res.json({ received: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`HDN Portal server running on port ${PORT}`));
