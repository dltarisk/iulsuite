import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { create } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET_RAW = Deno.env.get("JWT_SECRET")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { agent_id, pin } = await req.json();

    if (!agent_id || !pin) {
      return new Response(
        JSON.stringify({ error: "agent_id and pin are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to bypass RLS for auth lookup
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: agent, error } = await supabase
      .from("agents")
      .select("id, name, pin_hash, role, comp_rate, monthly_goal, active, recruiter_id")
      .eq("id", agent_id)
      .single();

    if (error || !agent) {
      return new Response(
        JSON.stringify({ error: "Agent not found" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Compare PIN against bcrypt hash
    const valid = bcrypt.compareSync(pin, agent.pin_hash);
    if (!valid) {
      return new Response(
        JSON.stringify({ error: "Incorrect PIN" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sign a custom JWT
    const encoder = new TextEncoder();
    const keyData = encoder.encode(JWT_SECRET_RAW);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: agent.id,
      role: "authenticated",       // Postgres role (required by PostgREST)
      user_role: agent.role,        // App-level role for RLS policies
      iss: "supabase",
      ref: SUPABASE_URL.replace("https://", "").replace(".supabase.co", ""),
      iat: now,
      exp: now + 86400, // 24 hours
      aud: "authenticated",
    };

    const token = await create({ alg: "HS256", typ: "JWT" }, payload, key);

    // Return token + agent info (without pin_hash)
    const { pin_hash: _, ...safeAgent } = agent;

    return new Response(
      JSON.stringify({ token, agent: safeAgent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
