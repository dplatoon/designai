import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, lstatSync } from 'fs';
import { join, basename, relative } from 'path';

const PROJECT_ROOT = process.cwd();
const TEMPLATES_DIR = join(PROJECT_ROOT, 'templates');
const BUILD_DIR = join(TEMPLATES_DIR, 'build');
const ZIPS_DIR = join(TEMPLATES_DIR, 'zips');
const DEFINITIONS_DIR = join(TEMPLATES_DIR, 'definitions');
const REFERENCE_DIR = join(TEMPLATES_DIR, 'reference');

// Simple YAML to JSON helper using npx js-yaml
function parseYaml(filePath: string): any {
    try {
        const jsonStr = execSync(`npx js-yaml "${filePath}"`, { encoding: 'utf-8' });
        return JSON.parse(jsonStr);
    } catch (error) {
        console.error(`Error parsing YAML ${filePath}:`, error);
        throw error;
    }
}

function copyRecursiveSync(src: string, dest: string, ignores: string[] = []) {
    const exists = existsSync(src);
    const stats = exists && lstatSync(src);
    const isDirectory = exists && stats && stats.isDirectory();
    if (isDirectory) {
        if (!existsSync(dest)) {
            mkdirSync(dest, { recursive: true });
        }
        readdirSync(src).forEach((childItemName) => {
            if (ignores.includes(childItemName)) return;
            copyRecursiveSync(join(src, childItemName), join(dest, childItemName), ignores);
        });
    } else {
        copyFileSync(src, dest);
    }
}

function copyFileSync(src: string, dest: string) {
    const content = readFileSync(src);
    writeFileSync(dest, content);
}

function deepMerge(base: any, patch: any) {
    if (typeof base !== 'object' || base === null || typeof patch !== 'object' || patch === null) {
        return patch;
    }
    const result = { ...base };
    for (const key in patch) {
        if (patch[key] === null) {
            delete result[key];
        } else if (typeof patch[key] === 'object' && !Array.isArray(patch[key])) {
            result[key] = deepMerge(result[key] || {}, patch[key]);
        } else {
            result[key] = patch[key];
        }
    }
    return result;
}

async function deploy() {
    console.log('🚀 Starting template deployment process (Node.js version)...');

    // 1. Prepare directories
    if (existsSync(BUILD_DIR)) rmSync(BUILD_DIR, { recursive: true, force: true });
    if (existsSync(ZIPS_DIR)) rmSync(ZIPS_DIR, { recursive: true, force: true });
    mkdirSync(BUILD_DIR, { recursive: true });
    mkdirSync(ZIPS_DIR, { recursive: true });

    // 2. Generate templates
    console.log('🧱 Generating templates...');
    const yamlFiles = readdirSync(DEFINITIONS_DIR).filter(f => f.endsWith('.yaml'));
    const catalog: any[] = [];

    for (const yamlFile of yamlFiles) {
        const yamlPath = join(DEFINITIONS_DIR, yamlFile);
        const config = parseYaml(yamlPath);
        const templateName = config.name;

        if (config.disabled) {
            console.log(`⏭️  Skipping disabled template: ${templateName}`);
            continue;
        }

        console.log(`  🔨 Generating ${templateName}...`);
        const targetDir = join(BUILD_DIR, templateName);
        mkdirSync(targetDir, { recursive: true });

        // Step 1: Copy base reference
        const baseRef = config.base_reference || 'shared-reference';
        const refPath = join(REFERENCE_DIR, baseRef);
        if (existsSync(refPath)) {
            copyRecursiveSync(refPath, targetDir, ['.git', 'node_modules', '.wrangler', 'dist']);
        }

        // Step 2: Overlay definition files
        const defFilesPath = join(DEFINITIONS_DIR, templateName);
        if (existsSync(defFilesPath)) {
            copyRecursiveSync(defFilesPath, targetDir, ['package.json']);
        }

        // Step 3: Patch package.json
        const pkgPath = join(targetDir, 'package.json');
        let pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf-8')) : {};
        if (!config.inherit_dependencies) {
            pkg.dependencies = {};
            pkg.devDependencies = {};
        }
        if (config.package_patches) {
            pkg = deepMerge(pkg, config.package_patches);
        }
        writeFileSync(pkgPath, JSON.stringify(pkg, null, '\t') + '\n');

        // Step 4: Apply file patches
        if (config.file_patches) {
            for (const patch of config.file_patches) {
                const filePath = join(targetDir, patch.file);
                if (existsSync(filePath)) {
                    let content = readFileSync(filePath, 'utf-8');
                    for (const rep of (patch.replacements || [])) {
                        content = content.split(rep.find).join(rep.replace);
                    }
                    for (const rep of (patch.regex_replacements || [])) {
                        const regex = new RegExp(rep.pattern, rep.flags || '');
                        content = content.replace(regex, rep.replace);
                    }
                    writeFileSync(filePath, content);
                }
            }
        }

        // Step 5: Apply excludes
        if (config.excludes) {
            // Very simple exclude implementation - just exact matches or directory removals
            // (Real generate_templates.py uses glob, we might need a library but let's try simple first)
            for (const pattern of config.excludes) {
                const p = join(targetDir, pattern);
                if (existsSync(p)) {
                    rmSync(p, { recursive: true, force: true });
                }
            }
        }

        // Add to catalog
        catalog.push({
            id: templateName,
            name: config.name,
            description: config.description,
            projectType: config.projectType,
            framework: config.framework,
            base_reference: baseRef
        });

        // Step 6: Create Zip
        console.log(`  📦 Zipping ${templateName}...`);
        const zipFile = join(ZIPS_DIR, `${templateName}.zip`);
        if (process.platform === 'win32') {
            // Use PowerShell for zipping on Windows
            execSync(`powershell -Command "Compress-Archive -Path '${targetDir}\\*' -DestinationPath '${zipFile}' -Force"`);
        } else {
            execSync(`zip -r "${zipFile}" .`, { cwd: targetDir });
        }
    }

    // 3. Save catalog
    const catalogPath = join(TEMPLATES_DIR, 'template_catalog.json');
    writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
    console.log('✅ Generated template catalog');

    // 4. Upload to R2
    const bucketName = process.env.R2_BUCKET_NAME || process.env.BUCKET_NAME;
    if (!bucketName) {
        console.error('❌ R2_BUCKET_NAME environment variable not set. Skipping upload.');
        return;
    }

    console.log(`🚀 Uploading to R2 bucket: ${bucketName}...`);
    // Upload catalog
    execSync(`wrangler r2 object put "${bucketName}/template_catalog.json" --file="${catalogPath}" --remote`, { stdio: 'inherit' });

    // Upload zips
    const zips = readdirSync(ZIPS_DIR).filter(f => f.endsWith('.zip'));
    for (const zip of zips) {
        const zipPath = join(ZIPS_DIR, zip);
        console.log(`  Uploading ${zip}...`);
        execSync(`wrangler r2 object put "${bucketName}/${zip}" --file="${zipPath}" --remote`, { stdio: 'inherit' });
    }

    console.log('🎯 Template deployment completed successfully!');
}

deploy().catch(err => {
    console.error('❌ Template deployment failed:', err);
    process.exit(1);
});
