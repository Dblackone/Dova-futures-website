// Only the Worker can access this database. Never log enquiry bodies or email addresses.
export async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function rateLimit(request, env) {
  const now=Date.now(), period=Math.floor(now/900000);
  const key=await digest(`${period}:${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
  const limit=Math.max(1,Math.min(100,Number(env.CONTACT_RATE_LIMIT)||5));
  const row=await env.DB.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count').bind(key,(period+1)*900000,limit).first();
  return Boolean(row);
}
export async function saveEnquiry(id, payload, env) {
  const hash=await digest(JSON.stringify(payload));
  const stored=JSON.stringify({payload,from:env.CONTACT_FROM_EMAIL,to:env.CONTACT_TO_EMAIL});
  const now=Date.now();
  await env.DB.prepare('INSERT INTO enquiries(id,payload_hash,payload,created_at,next_attempt) VALUES (?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,hash,stored,now,now).run();
  const row=await env.DB.prepare('SELECT * FROM enquiries WHERE id=?').bind(id).first();
  return row?.payload_hash===hash ? row : null;
}
export async function processEnquiry(row, env, deliver) {
  if (row.status!=='pending') return;
  const now=Date.now();
  // Resend retains idempotency keys for 24 hours; never retry beyond that boundary.
  if (now-row.created_at>=23*3600000 || row.attempts>=8) {
    await env.DB.prepare("UPDATE enquiries SET status='failed',last_error='Manual review required' WHERE id=? AND status='pending'").bind(row.id).run();
    console.error('[enquiry-needs-review]',row.id);return;
  }
  const claimed=await env.DB.prepare("UPDATE enquiries SET next_attempt=?,attempts=attempts+1 WHERE id=? AND status='pending' AND next_attempt<=? RETURNING id").bind(now+300000,row.id,now).first();
  if (!claimed) return;
  try {
    const saved=JSON.parse(row.payload);
    const providerId=await deliver(saved.payload,{...env,CONTACT_FROM_EMAIL:saved.from,CONTACT_TO_EMAIL:saved.to},row.id);
    await env.DB.prepare("UPDATE enquiries SET status='submitted',provider_id=?,last_error=NULL,next_attempt=? WHERE id=?").bind(providerId,now+900000,row.id).run();
  } catch {
    await env.DB.prepare("UPDATE enquiries SET next_attempt=?,last_error='Delivery attempt unsuccessful' WHERE id=? AND status='pending'").bind(now+Math.min(4*3600000,900000*2**row.attempts),row.id).run();
    console.error('[enquiry-retry-pending]',row.id);
  }
}
export async function maintainEnquiries(env, deliver) {
  if (!env.DB) throw new Error('Enquiry database is not configured');
  const now=Date.now();
  const pending=await env.DB.prepare("SELECT * FROM enquiries WHERE status='pending' AND next_attempt<=? ORDER BY next_attempt LIMIT 10").bind(now).all();
  for (const row of pending.results) await processEnquiry(row,env,deliver);
  const submitted=await env.DB.prepare("SELECT id,provider_id,created_at FROM enquiries WHERE status='submitted' AND next_attempt<=? ORDER BY next_attempt LIMIT 10").bind(now).all();
  for (const row of submitted.results) {
    // Avoid provider throttling by polling sequentially. A sending-only key may not permit status reads.
    try {
      const response=await fetch('https://api.resend.com/emails/'+encodeURIComponent(row.provider_id),{headers:{Authorization:'Bearer '+env.RESEND_API_KEY},signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw new Error('Status unavailable');
      const result=await response.json();
      const status=['delivered','bounced','complained','failed'].includes(result.last_event) ? result.last_event : 'submitted';
      await env.DB.prepare('UPDATE enquiries SET status=?,next_attempt=?,last_error=NULL WHERE id=?').bind(status,now+3600000,row.id).run();
      if(['bounced','complained','failed'].includes(status))console.error('[enquiry-delivery-problem]',row.id,status);
    } catch {
      await env.DB.prepare("UPDATE enquiries SET next_attempt=?,last_error='Delivery status unavailable' WHERE id=?").bind(now+3600000,row.id).run();
      console.error('[enquiry-status-unavailable]',row.id);
    }
  }
  // Seven-day operational recovery window. The team's email mailbox has a separate retention policy.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(now),
    env.DB.prepare('DELETE FROM enquiries WHERE created_at<?').bind(now-7*86400000),
  ]);
}
