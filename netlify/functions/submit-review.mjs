export default async (req) => {
  const reply = (status, message) => Response.json({ message }, { status });
  if (req.method !== 'POST') return reply(405, 'Method not allowed');
  try {
    const raw = await req.text();
    if (raw.length > 12000) return reply(400, 'Request too large');
    const { name, rating, comment, token } = JSON.parse(raw);
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80 || !Number.isInteger(rating) || rating < 1 || rating > 5 || typeof comment !== 'string' || comment.trim().length < 5 || comment.trim().length > 2000 || typeof token !== 'string' || !token || token.length > 2048) return reply(400, 'Please check your review.');
    const secret = process.env.TURNSTILE_SECRET_KEY;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!secret || !key) { console.error('Missing environment variables'); return reply(503, 'Reviews temporarily unavailable.'); }
    const check = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret, response: token }) });
    const v = await check.json();
    if (!v.success || v.hostname !== 'ollihandymanbristol.netlify.app' || v.action !== 'review') {
      console.error('Turnstile verification failed', { errors: v['error-codes'], hostname: v.hostname, action: v.action });
      return reply(400, 'Verification failed. Please try again.');
    }
    let approved = false;
    const apiKey = process.env.OPENAI_API_KEY;
    const text = comment.trim();
    const suspicious = /https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:crypto investment|buy followers|seo services)\b/i.test(name + ' ' + text);
    if (apiKey && !suspicious) {
      try {
        const moderation = await fetch('https://api.openai.com/v1/moderations', {
          method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
          signal: AbortSignal.timeout(5000)
        });
        if (moderation.ok) {
          const result = await moderation.json();
          approved = result.results?.[0]?.flagged === false;
        } else console.error('Moderation API status', moderation.status);
      } catch (error) { console.error('Moderation unavailable', error.name); }
    }
    const r = await fetch('https://vumhcazmkvuihzgrfwvh.supabase.co/rest/v1/reviews', { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ name: name.trim(), rating, comment: comment.trim(), approved }) });
    if (!r.ok) {
      const error = await r.json().catch(() => ({}));
      console.error('Supabase error', { status: r.status, code: error.code });
      return reply(503, 'Unable to save review. Please try again.');
    }
    return reply(200, approved ? 'Thank you! Your review has been published.' : 'Thank you! Your review is awaiting approval.');
  } catch (error) {
    console.error('Submit review error', { name: error.name, cause: error.cause?.code });
    return reply(500, 'Unable to submit review. Please try again.');
  }
};
