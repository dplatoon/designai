import { spawn } from 'child_process';
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

const env = getEnvVars();
const wrangler = spawn('npx', ['wrangler', 'tail', 'designai'], {
    env: { ...process.env, ...env },
    shell: true
});

wrangler.stdout.on('data', (data) => {
    console.log(data.toString());
});

wrangler.stderr.on('data', (data) => {
    console.error(data.toString());
});

wrangler.on('close', (code) => {
    console.log(`wrangler tail exited with code ${code}`);
});
