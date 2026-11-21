import { ToolDefinition } from "../tools/types";
import { SmartCodeGeneratorAgent } from "./smartGeneratorAgent";
import { CurrentDevState } from "./state";
import { z } from "zod";

export function getSmartAgentTools(agent: SmartCodeGeneratorAgent): ToolDefinition<any, any>[] {
    return [
        {
            type: "function",
            function: {
                name: "plan_next_phase",
                description: "Generates a conceptual plan for the next phase of development based on current progress and user requirements.",
                parameters: {
                    type: "object",
                    properties: {},
                },
            },
            implementation: async () => {
                const result = await agent.executePhaseGeneration();
                return {
                    nextState: result.currentDevState,
                    phase: result.result,
                    status: "Phase generated successfully"
                };
            },
        },
        {
            type: "function",
            function: {
                name: "implement_current_phase",
                description: "Implements the current planned phase by generating the necessary files and deploying them to the sandbox.",
                parameters: {
                    type: "object",
                    properties: {},
                },
            },
            implementation: async () => {
                const result = await agent.executePhaseImplementation();
                return {
                    nextState: result.currentDevState,
                    status: "Phase implementation completed"
                };
            },
        },
        {
            type: "function",
            function: {
                name: "review_and_fix_code",
                description: "Performs a full review of the generated code, identifies issues (syntax, logic, etc.), and attempts to fix them.",
                parameters: {
                    type: "object",
                    properties: {},
                },
            },
            implementation: async () => {
                const nextState = await agent.executeReviewCycle();
                return {
                    nextState,
                    status: "Code review and fixes completed"
                };
            },
        },
        {
            type: "function",
            function: {
                name: "finalize_project",
                description: "Performs final cleanup, generates a README, and prepares the project for final delivery.",
                parameters: {
                    type: "object",
                    properties: {},
                },
            },
            implementation: async () => {
                const nextState = await agent.executeFinalizing();
                return {
                    nextState,
                    status: "Project finalized"
                };
            },
        },
        {
            type: "function",
            function: {
                name: "get_project_status",
                description: "Returns the current state of the project, including generated files and completion status of phases.",
                parameters: {
                    type: "object",
                    properties: {},
                },
            },
            implementation: async () => {
                const state = await agent.getFullState();
                return {
                    generatedFiles: Object.keys(state.generatedFilesMap),
                    phases: state.generatedPhases.map(p => ({ name: p.name, completed: p.completed })),
                    currentDevState: state.currentDevState
                };
            },
        },
        {
            type: "function",
            function: {
                name: "read_file",
                description: "Reads the contents of a specific file from the project.",
                parameters: {
                    type: "object",
                    properties: {
                        filePath: {
                            type: "string",
                            description: "The path to the file to read."
                        }
                    },
                    required: ["filePath"]
                },
            },
            implementation: async ({ filePath }: { filePath: string }) => {
                const file = agent.getFileGenerated(filePath);
                if (file) {
                    return {
                        content: file.fileContents,
                        purpose: file.filePurpose
                    };
                }
                return { error: "File not found" };
            },
        }
    ];
}
