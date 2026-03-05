import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, lstatSync } from 'fs';
import { join, basename } from 'path';

function getEnvVars() {
    const varsPath = join(process.cwd(), '.prod.vars');
    const content = readFileSync(varsPath, 'utf8');
    const env: Record<string, string> = {};
    content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        const match = trimmed.match(/^([^=]+)\s*=\s*(.*)$/);
        if (match) {
            let value = match[2].trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.substring(1, value.length - 1);
            }
            env[match[1].trim()] = value;
        }
    });
    return env;
}

const envVars = getEnvVars();
const token = envVars.CLOUDFLARE_API_TOKEN;
const bucketName = 'vibesdk-templates';

if (!token) {
    console.error('CLOUDFLARE_API_TOKEN not found in .prod.vars');
    process.exit(1);
}

const PROJECT_ROOT = process.cwd();
const TEMPLATES_DIR = join(PROJECT_ROOT, 'templates');
const BUILD_DIR = join(TEMPLATES_DIR, 'build');
const ZIPS_DIR = join(TEMPLATES_DIR, 'zips');

function extractFrameworks(pkgPath: string): string[] {
    try {
        if (!existsSync(pkgPath)) return [];
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const allDeps = Object.keys(deps);

        const patterns = ['react', 'next', 'vue', 'hono', 'vite', 'tailwind', 'lucide-react', 'framer-motion', 'shadcn', 'drizzle', 'zod'];
        const found = new Set<string>();

        for (const dep of allDeps) {
            for (const pattern of patterns) {
                if (dep.toLowerCase().includes(pattern)) {
                    found.add(pattern);
                }
            }
        }
        return Array.from(found);
    } catch {
        return [];
    }
}

async function rebuildCatalogAndDeploy() {
    console.log('📋 Building template catalog...');

    const templates = readdirSync(BUILD_DIR).filter(d => lstatSync(join(BUILD_DIR, d)).isDirectory() && !d.startsWith('.'));
    const catalog: any[] = [];

    for (const templateName of templates) {
        const templateDir = join(BUILD_DIR, templateName);
        const promptsDir = join(templateDir, 'prompts');
        const pkgPath = join(templateDir, 'package.json');

        if (!existsSync(promptsDir)) {
            console.warn(`⚠️  Skipping ${templateName}: No prompts directory`);
            continue;
        }

        const selection = existsSync(join(promptsDir, 'selection.md'))
            ? readFileSync(join(promptsDir, 'selection.md'), 'utf-8').trim()
            : 'No selection guidelines provided.';

        const usage = existsSync(join(promptsDir, 'usage.md'))
            ? readFileSync(join(promptsDir, 'usage.md'), 'utf-8').trim()
            : 'No usage guidelines provided.';

        catalog.push({
            name: templateName,
            language: 'typescript',
            frameworks: extractFrameworks(pkgPath),
            description: {
                selection,
                usage
            }
        });
        console.log(`✅ Processed ${templateName}`);
    }

    const catalogPath = join(TEMPLATES_DIR, 'template_catalog.json');
    writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
    console.log(`✅ Catalog saved to ${catalogPath}`);

    console.log(`🚀 Uploading to R2 bucket: ${bucketName}...`);

    const wranglerEnv = { ...process.env, CLOUDFLARE_API_TOKEN: token };

    // Upload catalog
    console.log('  Uploading template_catalog.json...');
    execSync(`npx wrangler r2 object put "${bucketName}/template_catalog.json" --file="${catalogPath}" --remote`, {
        env: wranglerEnv,
        stdio: 'inherit'
    });

    // Upload zips
    const zips = readdirSync(ZIPS_DIR).filter(f => f.endsWith('.zip'));
    for (const zip of zips) {
        const zipPath = join(ZIPS_DIR, zip);
        console.log(`  Uploading ${zip}...`);
        execSync(`npx wrangler r2 object put "${bucketName}/${zip}" --file="${zipPath}" --remote`, {
            env: wranglerEnv,
            stdio: 'inherit'
        });
    }

    console.log('🎯 Template deployment complete!');
}

rebuildCatalogAndDeploy().catch(console.error);
