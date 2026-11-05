#!/usr/bin/env node
// Creates the owner login. Run once after the migrations:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-owner.mjs "Full Name" email@example.com
// It prompts for a password (not echoed, never stored in shell history).
import { createClient } from "@supabase/supabase-js";
import readline from "node:readline";

const [name, email] = process.argv.slice(2);
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!name || !email || !url || !key) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-owner.mjs "Full Name" email');
  process.exit(1);
}

async function askPassword() {
  if (process.env.OWNER_PASSWORD) return process.env.OWNER_PASSWORD; // for automated local setup only
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => rl.output.write(s.includes("Password") ? s : "");
  const pw = await new Promise((resolve) => rl.question("Password (min 12 characters): ", resolve));
  rl.close();
  process.stdout.write("\n");
  return pw;
}

const password = await askPassword();
if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
if (error) {
  console.error("Could not create login:", error.message);
  process.exit(1);
}
const { error: staffError } = await sb.from("staff").insert({ user_id: data.user.id, full_name: name, email, role: "owner" });
if (staffError) {
  await sb.auth.admin.deleteUser(data.user.id);
  console.error("Could not create staff record:", staffError.message);
  process.exit(1);
}
console.log(`Owner ${email} created. Sign in at /admin/login.`);
