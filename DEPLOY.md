# Historic Dream Nashville — Tenant Portal
## Deployment Guide (Render.com — Free)

---

### What's in this folder

| File | What it does |
|------|-------------|
| `server.js` | The backend — talks to Stripe securely using your secret key |
| `public/index.html` | The tenant portal — what your tenant sees |
| `.env.example` | Template for your secret keys (never share this) |
| `package.json` | Tells the server what libraries to use |

---

### Step 1 — Put this on GitHub (one time)

1. Go to github.com and create a free account if you don't have one
2. Click **New Repository** → name it `hdn-portal` → click **Create**
3. Upload all the files in this folder to that repository

---

### Step 2 — Deploy on Render (free hosting)

1. Go to **render.com** and sign up (free)
2. Click **New → Web Service**
3. Connect your GitHub account and select the `hdn-portal` repo
4. Set these settings:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
5. Click **Advanced → Add Environment Variable** and add:

   | Key | Value |
   |-----|-------|
   | `STRIPE_SECRET_KEY` | Your `sk_live_...` key from Stripe Dashboard |

6. Click **Create Web Service**
7. Render gives you a URL like `https://hdn-portal.onrender.com`

---

### Step 3 — Test it

1. Open your Render URL in a browser — you should see the portal
2. Go to your Stripe Dashboard → Customers to confirm entries appear when tested

---

### Step 4 — Get your tenant's link

Send your tenant this link:
```
https://hdn-portal.onrender.com
```

They'll be able to:
- Review the lease summary
- Enter their info
- Sign electronically
- Pay the $5,000 deposit
- Set up $4,766.67 (June) and $5,500 (July) autopay

---

### Step 5 — Confirm rent charges on due dates

The rent PaymentIntents are created but not charged automatically
(Stripe doesn't natively schedule future dates without a cron job).

On **June 1** and **July 1**, log into your Stripe Dashboard:
1. Go to **Payments → Payment Intents**
2. Find the two HDN rent intents (labelled "Month 1 Rent" and "Month 2 Rent")
3. Click **Confirm** to trigger each charge

Or let me know and I can add an automatic scheduler so it fires on its own.

---

### Your Stripe Dashboard — what to watch

- **stripe.com/dashboard → Payments** — all charges
- **stripe.com/dashboard → Customers** — tenant profile saved here
- **stripe.com/dashboard → Payment Intents** — deposit + rent records

---

### Questions?
Contact: danbremnes@gmail.com
