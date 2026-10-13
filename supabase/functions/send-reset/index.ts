// Supabase Edge Function "send-reset": emails a one-time password reset link to an account's recovery email.
// Called by the site's "Forgot password?" form with { username }.
// Always answers { ok: true } so it can't be used to find out which usernames exist or have an email.
//
// Secrets (Edge Functions → Secrets): BREVO_API_KEY or RESEND_API_KEY, plus SENDER_EMAIL.
// Optional: SITE_URL (default https://boston-lifesaver.vercel.app). SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
// Deploy with JWT verification OFF (the site calls it before anyone is signed in).
import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://boston-lifesaver.vercel.app";
const SENDER = Deno.env.get("SENDER_EMAIL") ?? "";
const MAX_PER_HOUR = 3;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sendEmail(to: string, subject: string, html: string, text: string) {
  const brevo = Deno.env.get("BREVO_API_KEY"), resend = Deno.env.get("RESEND_API_KEY");
  if (!SENDER || (!brevo && !resend)) throw new Error("No email provider configured (set SENDER_EMAIL and BREVO_API_KEY or RESEND_API_KEY)");
  const res = brevo
    ? await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": brevo, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ sender: { name: "Boston Lifesaver", email: SENDER }, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
      })
    : await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `Boston Lifesaver <${SENDER}>`, to: [to], subject, html, text }),
      });
  if (!res.ok) throw new Error(`Email provider error ${res.status}: ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);

  let username = "";
  try { username = String((await req.json()).username ?? "").trim().toLowerCase(); } catch { /* bad body */ }
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return reply({ ok: true });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
    if (!profile) return reply({ ok: true });
    const { data: rec } = await admin.from("recovery_emails").select("email").eq("user_id", profile.id).maybeSingle();
    if (!rec) return reply({ ok: true });

    // Rate limit so nobody can flood someone's inbox
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin.from("reset_requests").select("id", { count: "exact", head: true })
      .eq("user_id", profile.id).gte("created_at", since);
    if ((count ?? 0) >= MAX_PER_HOUR) return reply({ ok: true });
    await admin.from("reset_requests").insert({ user_id: profile.id });

    const { data: user } = await admin.auth.admin.getUserById(profile.id);
    if (!user?.user?.email) return reply({ ok: true });
    const { data: link, error } = await admin.auth.admin.generateLink({
      type: "recovery", email: user.user.email, options: { redirectTo: SITE_URL },
    });
    if (error || !link?.properties?.action_link) throw error ?? new Error("No link generated");
    const url = link.properties.action_link;

    const text = `Someone asked to reset the password for @${username} on Boston Lifesaver.\n\n` +
      `Set a new password: ${url}\n\nThe link works once and expires soon. If this wasn't you, ignore this email; your password hasn't changed.`;
    const html = `<p>Someone asked to reset the password for <b>@${username}</b> on Boston Lifesaver.</p>` +
      `<p><a href="${url}" style="display:inline-block;padding:10px 16px;background:#a5432b;color:#fff;border-radius:8px;text-decoration:none">Set a new password</a></p>` +
      `<p style="color:#5d656b;font-size:13px">The link works once and expires soon. If this wasn't you, ignore this email; your password hasn't changed.</p>`;
    await sendEmail(rec.email, "Reset your Boston Lifesaver password", html, text);
  } catch (e) {
    console.error("send-reset failed:", e instanceof Error ? e.message : e);   // visible in the function's logs
  }
  return reply({ ok: true });
});
