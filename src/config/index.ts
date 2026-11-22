import { z } from 'zod';

const configSchema = z.object({
  port: z.coerce.number().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  
  // Database
  databaseUrl: z.string().url(),
  
  // Supabase Configuration
  supabaseUrl: z.string().url(),
  supabaseAnonKey: z.string(),
  supabaseServiceRoleKey: z.string(),
  
  // JWT
  jwtSecret: z.string().min(32),
  jwtExpiresIn: z.string().default('7d'),
  
  // Email Configuration (Gmail SMTP)
  emailUser: z.string().email(),
  emailAppPassword: z.string().optional(),
  emailFrom: z.string().default('Baymax <baymaxai43@gmail.com>'),
  
  // CORS
  corsOrigin: z.string().default('*'),
  
  // AI Providers
  geminiApiKey: z.string().optional(),
  groqApiKey: z.string().optional(),
  openrouterApiKey: z.string().optional(),
  
  // Vercel
  vercelToken: z.string().optional(),
  vercelTeamId: z.string().optional(),
  
  // Payment
  stripeSecretKey: z.string().optional(),
  stripeWebhookSecret: z.string().optional(),
});

export const config = configSchema.parse(process.env);

export type Config = z.infer<typeof configSchema>;
