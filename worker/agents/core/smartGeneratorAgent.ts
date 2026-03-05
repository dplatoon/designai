import { SimpleCodeGeneratorAgent } from "./simpleGeneratorAgent";
import { CodeGenState, CurrentDevState } from "./state";
import { AgentInitArgs } from "./types";
import { executeInference } from "../inferutils/infer";
import { createSystemMessage, createUserMessage } from "../inferutils/common";
import { getSmartAgentTools } from "./smartAgentTools";
import { WebSocketMessageResponses } from "../constants";

/**
 * SmartCodeGeneratorAgent - Smartly orchestrated AI-powered code generation
 * using an LLM orchestrator instead of state machine based orchestrator.
 * TODO: NOT YET IMPLEMENTED, CURRENTLY Just uses SimpleCodeGeneratorAgent
 */
export class SmartCodeGeneratorAgent extends SimpleCodeGeneratorAgent {

    /**
     * Initialize the smart code generator with project blueprint and template
     * Sets up services and begins deployment process
     */
    async initialize(
        initArgs: AgentInitArgs,
        agentMode: 'deterministic' | 'smart'
    ): Promise<CodeGenState> {
        this.logger().info('🧠 Initializing SmartCodeGeneratorAgent with enhanced AI orchestration', {
            queryLength: initArgs.query.length,
            agentType: agentMode
        });

        // Call the parent initialization
        return await super.initialize(initArgs);
    }

    async generateAllFiles(reviewCycles: number = 10): Promise<void> {
        if (this.state.agentMode === 'deterministic') {
            return super.generateAllFiles(reviewCycles);
        } else {
            return this.builderLoop();
        }
    }

    async builderLoop(): Promise<void> {
        this.logger().info('🧠 Starting Smart Builder Loop');
        this.broadcast(WebSocketMessageResponses.GENERATION_STARTED, {
            message: 'Starting smart AI orchestration',
            totalFiles: this.getTotalFiles()
        });
        this.isGenerating = true;

        const systemPrompt = `
You are the Smart Orchestrator for DesignAI. Your goal is to build a complete, high-quality web application based on the user's requirements.

You have access to powerful tools to plan, implement, and review code:
1. **plan_next_phase**: Always start by planning the first/next phase.
2. **implement_current_phase**: After planning, implement it.
3. **review_and_fix_code**: Essential for catching typos, TypeScript errors, and logic bugs. Run this after implementation.
4. **finalize_project**: Call this when the app is fully functional and meets all requirements.

Your workflow should be:
Plan -> Implement -> Review/Fix -> Repeat until complete -> Finalize.

Be proactive. If you see errors, fix them. If the user's request is complex, break it into logical phases.
`;

        const messages = [
            createSystemMessage(systemPrompt),
            createUserMessage(`User Request: ${this.state.query}\n\nExisting Blueprint: ${JSON.stringify(this.state.blueprint)}`)
        ];

        try {
            let loopCount = 0;
            const MAX_LOOP = 20;

            // Kick off the loop by marking the agent as active
            this.setState({ ...this.state, currentDevState: CurrentDevState.PHASE_GENERATING });

            while (this.state.currentDevState !== CurrentDevState.IDLE && loopCount < MAX_LOOP) {
                loopCount++;
                this.logger().info(`[builderLoop] Iteration ${loopCount}, current state: ${this.state.currentDevState}`);

                const response = await executeInference({
                    env: this.env,
                    messages,
                    agentActionName: 'blueprint', // Heavy lifting model
                    context: this.state.inferenceContext,
                    tools: getSmartAgentTools(this)
                });

                if (response && 'string' in response && response.string) {
                    messages.push({ role: 'assistant', content: response.string });
                    this.broadcast(WebSocketMessageResponses.CONVERSATIONAL_RESPONSE, {
                        content: response.string
                    });
                }

                // If tools transitioned state to IDLE, stop
                if ((this.state.currentDevState as CurrentDevState) === CurrentDevState.IDLE) {
                    break;
                }
            }

            if (loopCount >= MAX_LOOP) {
                this.logger().warn('Builder loop reached maximum iterations');
            }

            this.logger().info('Smart Builder Loop completed successfully');
        } catch (error) {
            this.logger().error('Error in builderLoop:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.broadcast(WebSocketMessageResponses.ERROR, {
                error: `Smart Generation failed: ${errorMessage}`
            });
        } finally {
            this.isGenerating = false;
        }
    }
}