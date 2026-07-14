async function stripeGet(path) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}` }
  });
  return res.json();
}

function hasAccess(status) {
  return ['active', 'trialing', 'past_due'].includes(status);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { session_id, email } = req.body;

  try {
    // New subscriber returning from Stripe Checkout
    if (session_id) {
      const session = await stripeGet(`/checkout/sessions/${session_id}`);
      if (session.error) return res.json({ valid: false, reason: 'Invalid session' });

      const customerEmail = session.customer_details?.email;
      if (!customerEmail) return res.json({ valid: false, reason: 'No email found' });

      if (session.subscription) {
        const sub = await stripeGet(`/subscriptions/${session.subscription}`);
        if (hasAccess(sub.status)) {
          return res.json({ valid: true, email: customerEmail, status: sub.status });
        }
      }

      // Checkout just completed — grant access
      if (session.status === 'complete') {
        return res.json({ valid: true, email: customerEmail, status: 'trialing' });
      }

      return res.json({ valid: false, reason: 'Subscription not active' });
    }

    // Returning user signing in with email
    if (email) {
      const customers = await stripeGet(`/customers?email=${encodeURIComponent(email)}&limit=5`);
      if (!customers.data || customers.data.length === 0) {
        return res.json({ valid: false, reason: 'No account found with this email address' });
      }

      for (const customer of customers.data) {
        const subs = await stripeGet(`/subscriptions?customer=${customer.id}&limit=10`);
        for (const sub of (subs.data || [])) {
          if (hasAccess(sub.status)) {
            return res.json({ valid: true, email, status: sub.status });
          }
        }
      }

      return res.json({ valid: false, reason: 'No active subscription found for this email' });
    }

    return res.status(400).json({ valid: false, reason: 'Missing session_id or email' });
  } catch (err) {
    console.error('Verify error:', err);
    return res.status(500).json({ valid: false, reason: 'Verification failed — please try again' });
  }
};
