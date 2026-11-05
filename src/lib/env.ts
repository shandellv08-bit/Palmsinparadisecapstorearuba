import { z } from "zod";

/**
 * All environment variables, validated once. Anything optional may be missing
 * and the feature that needs it switches itself off rather than crashing.
 * NEXT_PUBLIC_* values are visible in the browser; everything else is server-only.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  RESEND_API_KEY: z.string().min(10).optional(),
  ORDER_EMAIL_FROM: z.string().min(3).optional(),
  ORDER_NOTIFY_EMAIL: z.string().email().optional(),
  ANTHROPIC_API_KEY: z.string().min(10).optional(),
  REVALIDATE_SECRET: z.string().min(24).optional(),
});

const empty = (v: string | undefined) => (v === undefined || v.trim() === "" ? undefined : v.trim());

const parsed = schema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: empty(process.env.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: empty(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  NEXT_PUBLIC_SITE_URL: empty(process.env.NEXT_PUBLIC_SITE_URL),
  SUPABASE_SERVICE_ROLE_KEY: empty(process.env.SUPABASE_SERVICE_ROLE_KEY),
  RESEND_API_KEY: empty(process.env.RESEND_API_KEY),
  ORDER_EMAIL_FROM: empty(process.env.ORDER_EMAIL_FROM),
  ORDER_NOTIFY_EMAIL: empty(process.env.ORDER_NOTIFY_EMAIL),
  ANTHROPIC_API_KEY: empty(process.env.ANTHROPIC_API_KEY),
  REVALIDATE_SECRET: empty(process.env.REVALIDATE_SECRET),
});

if (!parsed.success) {
  // Names only, never values.
  const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
  throw new Error(`Invalid environment variables: ${names}. See .env.example.`);
}

export const env = parsed.data;
