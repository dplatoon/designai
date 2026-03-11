import { SandboxSdkClient } from "./sandboxSdkClient";
import { RemoteSandboxServiceClient } from "./remoteSandboxService";
import { LocalSandboxService } from "./localSandboxService";
import { BaseSandboxService } from "./BaseSandboxService";
import { env } from 'cloudflare:workers'

export function getSandboxService(sessionId: string): BaseSandboxService {
    if ((env as any).SANDBOX_SERVICE_TYPE == 'runner') {
        console.log("[getSandboxService] Using runner service for sandboxing");
        return new RemoteSandboxServiceClient(sessionId);
    }

    // Fallback to local mock sandbox if Sandbox binding is missing (e.g. containers disabled and no Docker)
    if (!env.Sandbox) {
        console.log("[getSandboxService] Sandbox binding missing, falling back to LocalSandboxService (Mock)");
        return new LocalSandboxService(sessionId);
    }

    console.log("[getSandboxService] Using sandboxsdk service for sandboxing");
    return new SandboxSdkClient(sessionId);
}