import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load environment variables from .env file
const envPath = join(__dirname, '..', '.env');
const envContent = readFileSync(envPath, 'utf8');
const envVars: Record<string, string> = {};

envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const pool = new Pool({
  connectionString: envVars.DATABASE_URL,
});

async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('✅ Database connection successful!');
    console.log('Current time:', result.rows[0].current_time);
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    await pool.end();
    process.exit(1);
  }
}

testConnection();
