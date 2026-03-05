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
    console.log('📋 Checking application state...');

    // Check apps table
    const cmd = `npx wrangler d1 execute vibesdk-db --remote --command="SELECT * FROM apps ORDER BY created_at DESC LIMIT 5;"`;

    try {
        const output = execSync(cmd, {
            env: { ...process.env, ...env },
            encoding: 'utf-8'
        });
        console.log('Recent Apps:');
        console.log(output);
    } catch (e: any) {
        console.error('Error fetching apps:', e.message);
    }
}

run();
