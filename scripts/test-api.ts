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

async function testApi() {
    const env = getEnvVars();
    const BASE_URL = `https://${env.CUSTOM_DOMAIN}`;
    const API_URL = `${BASE_URL}/api/agent`;

    console.log(`📡 Testing API: ${API_URL}`);

    try {
        // Step 1: GET to establish session and get CSRF token
        console.log('Establishing session via /api/health...');
        const initRes = await fetch(`${BASE_URL}/api/health`);
        const setCookieHeaders = initRes.headers.getSetCookie ? initRes.headers.getSetCookie() : [];

        console.log(`Initial Status: ${initRes.status}`);

        // Extract CSRF token from cookies
        let csrfToken = '';
        const csrfCookie = setCookieHeaders.find(c => c.startsWith('csrf-token='));
        if (csrfCookie) {
            const encodedValue = csrfCookie.split(';')[0].split('=')[1];
            try {
                const decoded = JSON.parse(decodeURIComponent(encodedValue));
                csrfToken = decoded.token;
            } catch {
                csrfToken = encodedValue;
            }
        }

        console.log(`CSRF Token: ${csrfToken ? 'Found' : 'Not found'}`);
        if (!csrfToken) {
            console.log('Set-Cookie headers received:', setCookieHeaders);
        }

        // Step 2: POST to start code generation
        console.log('Starting code generation...');
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': setCookieHeaders.map(c => c.split(';')[0]).join('; '),
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({
                query: 'create a landing page with glassmorphism design and vibrant colors'
            })
        });

        console.log(`Status: ${response.status}`);
        const text = await response.text();
        console.log(`Response: ${text.substring(0, 1000)}`);
    } catch (e: any) {
        console.error(`Fetch error: ${e.message}`);
    }
}

testApi();
