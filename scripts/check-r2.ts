import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function getEnvVars() {
    const varsPath = path.join(process.cwd(), '.prod.vars');
    const content = fs.readFileSync(varsPath, 'utf8');
    const env: Record<string, string> = {};
    content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        const match = trimmed.match(/^([^=]+)\s*=\s*(.*)$/);
        if (match) {
            let value = match[2].trim();
            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.substring(1, value.length - 1);
            }
            env[match[1].trim()] = value;
        }
    });
    return env;
}

const env = getEnvVars();
const token = env.CLOUDFLARE_API_TOKEN;

if (!token) {
    console.error('CLOUDFLARE_API_TOKEN not found in .prod.vars');
    process.exit(1);
}

const buckets = ['vibesdk-templates'];

buckets.forEach(bucket => {
    console.log(`\n📦 Checking bucket: ${bucket}`);
    try {
        const cmd = `npx wrangler r2 object list ${bucket}`;
        const output = execSync(cmd, {
            env: { ...process.env, CLOUDFLARE_API_TOKEN: token },
            encoding: 'utf-8'
        });
        console.log(output);
    } catch (error: any) {
        console.error(`Error checking bucket ${bucket}:`, error.message);
    }
});
