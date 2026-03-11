import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PROJECT_ROOT = process.cwd();
const PROD_VARS_PATH = join(PROJECT_ROOT, '.prod.vars');

function getEnvVars() {
    if (!existsSync(PROD_VARS_PATH)) {
        throw new Error('.prod.vars not found');
    }
    const content = readFileSync(PROD_VARS_PATH, 'utf-8');
    const env: Record<string, string> = {};
    content.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#') && line.includes('=')) {
            const [key, ...valueParts] = line.split('=');
            let value = valueParts.join('=').trim();
            // Remove quotes if present
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.substring(1, value.length - 1);
            }
            env[key.trim()] = value;
        }
    });
    return env;
}

async function run() {
    const env = getEnvVars();
    const envString = `CLOUDFLARE_API_TOKEN=${env.CLOUDFLARE_API_TOKEN} CLOUDFLARE_ACCOUNT_ID=${env.CLOUDFLARE_ACCOUNT_ID}`;

    // On Windows we need to set them differently
    const isWindows = process.platform === 'win32';

    console.log('🔍 Fetching latest OTPs...');
    let cmd = `npx wrangler d1 execute vibesdk-db --remote --command="SELECT * FROM verification_otps ORDER BY created_at DESC LIMIT 5;"`;

    try {
        const output = execSync(cmd, {
            env: { ...process.env, ...env },
            encoding: 'utf-8'
        });
        console.log('Latest OTPs:');
        console.log(output);
    } catch (e) {
        console.error('Error fetching OTPs:', e);
    }

    console.log('\n🔍 Fetching unverified users...');
    cmd = `npx wrangler d1 execute vibesdk-db --remote --command="SELECT id, email, email_verified FROM users WHERE email_verified = 0;"`;
    try {
        const output = execSync(cmd, {
            env: { ...process.env, ...env },
            encoding: 'utf-8'
        });
        console.log('Unverified users:');
        console.log(output);
    } catch (e) {
        console.error('Error fetching users:', e);
    }
}

run();
