
import {
    TemplateDetailsResponse,
    BootstrapResponse,
    GetInstanceResponse,
    BootstrapStatusResponse,
    ShutdownResponse,
    WriteFilesRequest,
    WriteFilesResponse,
    GetFilesResponse,
    ExecuteCommandsResponse,
    RuntimeErrorResponse,
    ClearErrorsResponse,
    StaticAnalysisResponse,
    DeploymentResult,
    GetLogsResponse,
    ListInstancesResponse,
    GitHubPushRequest,
    GitHubPushResponse,
    GitHubExportRequest,
    GitHubExportResponse,
    InstanceDetails,
} from './sandboxTypes';
import { BaseSandboxService } from "./BaseSandboxService";

/**
 * LocalSandboxService - A mock implementation for when real sandboxes (Containers) are not available.
 * It stores files in-memory and simulates command execution.
 */
export class LocalSandboxService extends BaseSandboxService {
    private filesMap: Map<string, string> = new Map();
    private instances: Map<string, any> = new Map();

    private static MOCK_TEMPLATES: Record<string, any> = {
        "minimal-js": {
            files: [
                { filePath: "public/index.html", fileContents: "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <title>Minimal JS Template</title>\n    <link rel=\"stylesheet\" href=\"/styles.css\" />\n  </head>\n  <body>\n    <main class=\"container\">\n      <h1>Minimal JS Template</h1>\n      <p>This is a barebones single-page app served by Cloudflare Workers.</p>\n      <button id=\"btn-health\">Ping /api/health</button>\n      <pre id=\"result\"></pre>\n    </main>\n    <script src=\"/app.js\" defer></script>\n  </body>\n</html>" },
                { filePath: "public/styles.css", fileContents: ":root { --bg: #0b0b0f; --text: #eaeaf2; }\nbody { background: var(--bg); color: var(--text); font-family: sans-serif; }\n.container { max-width: 800px; margin: 0 auto; padding: 2rem; }" },
                { filePath: "public/app.js", fileContents: "document.addEventListener('DOMContentLoaded', () => {\n  const btn = document.getElementById('btn-health');\n  const out = document.getElementById('result');\n  btn?.addEventListener('click', async () => {\n    out.textContent = 'Loading...';\n    const res = await fetch('/api/health');\n    out.textContent = await res.text();\n  });\n});" },
                { filePath: "worker/index.ts", fileContents: "import { Hono } from 'hono';\nconst app = new Hono();\napp.get('/api/health', (c) => c.json({ success: true }));\nexport default { fetch: app.fetch };" },
                { filePath: "package.json", fileContents: "{\n  \"name\": \"minimal-js\",\n  \"type\": \"module\",\n  \"scripts\": { \"dev\": \"wrangler dev\", \"build\": \"wrangler build\" }\n}" },
                { filePath: "wrangler.jsonc", fileContents: "{\n  \"name\": \"user-app\",\n  \"main\": \"worker/index.ts\",\n  \"compatibility_date\": \"2024-01-01\",\n  \"assets\": { \"directory\": \"public\", \"binding\": \"ASSETS\" }\n}" }
            ],
            fileTree: {
                path: "/",
                type: "directory",
                children: [
                    {
                        path: "public", type: "directory", children: [
                            { path: "public/index.html", type: "file" },
                            { path: "public/styles.css", type: "file" },
                            { path: "public/app.js", type: "file" }
                        ]
                    },
                    {
                        path: "worker", type: "directory", children: [
                            { path: "worker/index.ts", type: "file" }
                        ]
                    },
                    { path: "package.json", type: "file" },
                    { path: "wrangler.jsonc", type: "file" }
                ]
            }
        }
    };

    constructor(sandboxId: string) {
        super(sandboxId);
        this.logger.info('LocalSandboxService initialized (Mock Mode)', { sandboxId: this.sandboxId });
    }

    async initialize(): Promise<void> {
        this.logger.info('LocalSandboxService initialization complete');
    }

    async getTemplateDetails(templateName: string): Promise<TemplateDetailsResponse> {
        this.logger.info('Mock getTemplateDetails', { templateName });

        const mockTemplate = LocalSandboxService.MOCK_TEMPLATES[templateName];
        if (mockTemplate) {
            return {
                success: true,
                templateDetails: {
                    name: templateName,
                    description: { selection: "Mock template", usage: "Mock usage" },
                    fileTree: mockTemplate.fileTree,
                    files: mockTemplate.files,
                    deps: {},
                    dontTouchFiles: [],
                    redactedFiles: []
                }
            };
        }

        return {
            success: true,
            templateDetails: {
                name: templateName,
                description: { selection: "Generic Mock template", usage: "Mock usage" },
                fileTree: { path: "/", type: "directory", children: [{ path: "package.json", type: "file" }] },
                files: [{ filePath: "package.json", fileContents: "{}" }],
                deps: {},
                dontTouchFiles: [],
                redactedFiles: []
            }
        };
    }

    async createInstance(templateName: string, projectName: string, webhookUrl?: string, envVars?: Record<string, string>): Promise<BootstrapResponse> {
        this.logger.info('Mock createInstance', { templateName, projectName });
        const runId = `mock-${templateName}-${Date.now()}`;

        // Pre-load files from template
        const mockTemplate = LocalSandboxService.MOCK_TEMPLATES[templateName];
        if (mockTemplate) {
            for (const file of mockTemplate.files) {
                this.filesMap.set(file.filePath, file.fileContents);
            }
        }

        this.instances.set(runId, { templateName, projectName, status: 'running' });
        const previewURL = `https://${runId}.mock.preview`;
        return {
            success: true,
            runId,
            previewURL
        };
    }

    async listAllInstances(): Promise<ListInstancesResponse> {
        return {
            success: true,
            instances: Array.from(this.instances.entries()).map(([id, info]) => ({
                runId: id,
                templateName: info.templateName,
                startTime: new Date().toISOString(),
                uptime: 0,
                directory: "/mock",
                serviceDirectory: "/mock/service",
            } as InstanceDetails)),
            count: this.instances.size
        };
    }

    async getInstanceDetails(instanceId: string): Promise<GetInstanceResponse> {
        const info = this.instances.get(instanceId);
        if (!info) return { success: false, error: "Instance not found" };
        return {
            success: true,
            instance: {
                runId: instanceId,
                templateName: info.templateName,
                startTime: new Date().toISOString(),
                uptime: 0,
                directory: "/mock",
                serviceDirectory: "/mock/service",
            } as InstanceDetails
        };
    }

    async getInstanceStatus(instanceId: string): Promise<BootstrapStatusResponse> {
        return {
            success: true,
            pending: false,
            isHealthy: true,
            message: "Mock instance running",
            previewURL: `https://${instanceId}.mock.preview`
        };
    }

    async shutdownInstance(instanceId: string): Promise<ShutdownResponse> {
        this.instances.delete(instanceId);
        return { success: true, message: "Mock instance shut down" };
    }

    async writeFiles(instanceId: string, files: WriteFilesRequest['files'], commitMessage?: string): Promise<WriteFilesResponse> {
        for (const file of files) {
            this.filesMap.set(file.filePath, file.fileContents);
        }
        return {
            success: true,
            message: `Wrote ${files.length} files to mock sandbox`,
            results: files.map(f => ({ file: f.filePath, success: true }))
        };
    }

    async getFiles(instanceId: string, filePaths?: string[]): Promise<GetFilesResponse> {
        const resultFiles = [];
        const paths = filePaths || Array.from(this.filesMap.keys());
        for (const path of paths) {
            if (this.filesMap.has(path)) {
                resultFiles.push({ filePath: path, fileContents: this.filesMap.get(path) || '' });
            }
        }
        return { success: true, files: resultFiles };
    }

    async getLogs(instanceId: string): Promise<GetLogsResponse> {
        return { success: true, logs: { stdout: "", stderr: "" } };
    }

    async executeCommands(instanceId: string, commands: string[], timeout?: number): Promise<ExecuteCommandsResponse> {
        this.logger.info('Mock executeCommands', { commands });
        return {
            success: true,
            results: commands.map(cmd => ({
                command: cmd,
                success: true,
                output: `Mock output for ${cmd}`,
                exitCode: 0,
            }))
        };
    }

    async getInstanceErrors(instanceId: string): Promise<RuntimeErrorResponse> {
        return { success: true, errors: [], hasErrors: false };
    }

    async clearInstanceErrors(instanceId: string): Promise<ClearErrorsResponse> {
        return { success: true };
    }

    async runStaticAnalysisCode(instanceId: string, lintFiles?: string[]): Promise<StaticAnalysisResponse> {
        return {
            success: true,
            lint: { issues: [], summary: { errorCount: 0, warningCount: 0, infoCount: 0 } },
            typecheck: { issues: [], summary: { errorCount: 0, warningCount: 0, infoCount: 0 } }
        };
    }

    async deployToCloudflareWorkers(instanceId: string): Promise<DeploymentResult> {
        return {
            success: true,
            message: "Mock deployment successful (did nothing)",
            deployedUrl: `https://${instanceId}.workers.dev`
        };
    }

    async exportToGitHub(instanceId: string, request: GitHubExportRequest): Promise<GitHubExportResponse> {
        return { success: true, repositoryUrl: "https://github.com/mock/repo" };
    }

    async pushToGitHub(instanceId: string, request: GitHubPushRequest): Promise<GitHubPushResponse> {
        return { success: true };
    }
}
