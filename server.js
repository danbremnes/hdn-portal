require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

async function getOrCreateCustomer(tenantName, tenantEmail) {
  const existing = await stripe.customers.list({ email: tenantEmail, limit: 1 });
  if (existing.data.length > 0) return existing.data[0];
  return stripe.customers.create({
    name: tenantName,
    email: tenantEmail,
    metadata: { property: '806 Boscobel Street, Nashville TN 37206', lease_term: 'June 1 - July 31, 2026' },
  });
}

// DEPOSIT PaymentIntent — card or ACH via Financial Connections
app.post('/create-deposit-intent', async (req, res) => {
  try {
    const { tenantName, tenantEmail, paymentMethodType } = req.body;
    const customer = await getOrCreateCustomer(tenantName, tenantEmail);
    const params = {
      amount: 500000,
      currency: 'usd',
      customer: customer.id,
      metadata: { type: 'security_deposit', tenant_name: tenantName, tenant_email: tenantEmail, property: '806 Boscobel St Nashville TN', lease_term: 'June 1 - July 31 2026' },
      description: 'Security Deposit - 806 Boscobel St, Nashville TN 37206',
      receipt_email: tenantEmail,
    };
    if (paymentMethodType === 'us_bank_account') {
      params.payment_method_types = ['us_bank_account'];
      params.payment_method_options = { us_bank_account: { financial_connections: { permissions: ['payment_method'] } } };
    } else {
      params.payment_method_types = ['card'];
    }
    const intent = await stripe.paymentIntents.create(params);
    res.json({ clientSecret: intent.client_secret, customerId: customer.id });
  } catch (err) {
    console.error('Deposit error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// RENT SetupIntent — saves payment method for future charges
app.post('/create-setup-intent', async (req, res) => {
  try {
    const { tenantName, tenantEmail, paymentMethodType } = req.body;
    const customer = await getOrCreateCustomer(tenantName, tenantEmail);
    const params = {
      customer: customer.id,
      usage: 'off_session',
      metadata: { type: 'rent_autopay', tenant_name: tenantName, tenant_email: tenantEmail },
    };
    if (paymentMethodType === 'us_bank_account') {
      params.payment_method_types = ['us_bank_account'];
      params.payment_method_options = { us_bank_account: { financial_connections: { permissions: ['payment_method'] } } };
    } else {
      params.payment_method_types = ['card'];
    }
    const si = await stripe.setupIntents.create(params);
    res.json({ clientSecret: si.client_secret, customerId: customer.id });
  } catch (err) {
    console.error('Setup error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// SCHEDULE autopay — queues both rent PaymentIntents
app.post('/schedule-autopay', async (req, res) => {
  try {
    const { customerId, paymentMethodId, tenantEmail } = req.body;
    try { await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId }); } catch (e) { if (!e.message.includes('already been attached')) throw e; }
    await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
    const c1 = await stripe.paymentIntents.create({ amount: 476667, currency: 'usd', customer: customerId, payment_method: paymentMethodId, off_session: true, confirm: false, description: 'Month 1 Rent June 2026 - 806 Boscobel St', receipt_email: tenantEmail, metadata: { type: 'rent_month_1', due_date: '2026-06-01' } });
    const c2 = await stripe.paymentIntents.create({ amount: 550000, currency: 'usd', customer: customerId, payment_method: paymentMethodId, off_session: true, confirm: false, description: 'Month 2 Rent July 2026 - 806 Boscobel St', receipt_email: tenantEmail, metadata: { type: 'rent_month_2', due_date: '2026-07-01' } });
    res.json({ success: true, month1IntentId: c1.id, month2IntentId: c2.id });
  } catch (err) {
    console.error('Autopay error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || ''); } catch (err) { return res.status(400).send(`Webhook error: ${err.message}`); }
  console.log('Webhook:', event.type, event.data.object.id);
  res.json({ received: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`HDN Portal running on port ${PORT}`));
