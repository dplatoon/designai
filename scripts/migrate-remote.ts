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
    console.log('🚀 Running database migrations remotely...');

    // Step 1: Generate migrations
    console.log('  🔨 Generating migrations...');
    try {
        execSync('npm run db:generate:remote', { stdio: 'inherit' });
    } catch (e) {
        console.error('  ❌ Migration generation failed');
        // Continue anyway if it's just "no changes"
    }

    // Step 2: Apply migrations
    console.log('  🚢 Applying migrations to remote D1...');
    // We don't use 'CI=true' prefix here, we just run wrangler directly with env vars
    const cmd = `npx wrangler d1 migrations apply vibesdk-db --remote`;

    try {
        const output = execSync(cmd, {
            env: { ...process.env, ...env, CI: 'true' },
            encoding: 'utf-8'
        });
        console.log(output);
        console.log('✅ Migrations applied successfully!');
    } catch (e: any) {
        console.error('  ❌ Migration application failed:', e.message);
    }
}

run();
