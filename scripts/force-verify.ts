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
    console.log('🦾 Force verifying user: hasantawhid2096@gmail.com...');
    const cmd = `npx wrangler d1 execute vibesdk-db --remote --command="UPDATE users SET email_verified = 1 WHERE email = 'hasantawhid2096@gmail.com';"`;

    try {
        const output = execSync(cmd, {
            env: { ...process.env, ...env },
            encoding: 'utf-8'
        });
        console.log(output);
        console.log('✅ User verified successfully!');
    } catch (e) {
        console.error('Error verifying user:', e);
    }
}

run();
