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

async function checkGateway() {
    const env = getEnvVars();
    const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai-gateway/gateways/vibesdk-gateway`;

    console.log(`🔍 Checking AI Gateway: vibesdk-gateway`);

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json() as any;
        console.log('Gateway Info:', JSON.stringify(data, null, 2));

        if (!data.success) {
            console.log('❌ Gateway does not exist or access denied.');
        } else {
            console.log('✅ Gateway exists!');
        }
    } catch (e: any) {
        console.error(`Error checking gateway: ${e.message}`);
    }
}

checkGateway();
