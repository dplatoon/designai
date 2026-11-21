import { CodeReviewOutputType, CodeReviewOutput, FileOutputSchema } from '../schemas';
import { GenerationContext } from '../domain/values/GenerationContext';
import { IssueReport } from '../domain/values/IssueReport';
import { createSystemMessage, createUserMessage } from '../inferutils/common';
import { executeInference } from '../inferutils/infer';
import { generalSystemPromptBuilder, issuesPromptFormatter, PROMPT_UTILS } from '../prompts';
import { TemplateRegistry } from '../inferutils/schemaFormatters';
import { z } from 'zod';
import { AgentOperation, OperationOptions } from '../operations/common';

export interface CodeReviewInputs {
    issues: IssueReport
}

const BASE_SYSTEM_PROMPT = `You are a Senior Software Engineer at Cloudflare specializing in comprehensive React application analysis. Your mandate is to identify ALL critical issues across the ENTIRE codebase.

## ANALYSIS FOCUS: {{perspective}}

### KEY PRIORITIES:
{{priorities}}

## COMPREHENSIVE ANALYSIS METHOD:
1. **Scan ENTIRE codebase systematically** - don't just focus on reported errors
2. **Analyze each component for completeness** - check if features are fully implemented
3. **Cross-reference errors with current code** - validate issues exist
4. **Check data flow and state management** - ensure proper state handling
5. **Review UI/UX implementation** - verify user experience is correct
6. **Validate business logic** - ensure functionality works as intended
7. **Provide actionable, specific fixes** - not general suggestions

${PROMPT_UTILS.COMMANDS}

## COMMON PATTERNS TO AVOID:
${PROMPT_UTILS.COMMON_PITFALLS}
${PROMPT_UTILS.REACT_RENDER_LOOP_PREVENTION} 

<CLIENT REQUEST>
"{{query}}"
</CLIENT REQUEST>

<DEPENDENCIES>
These are the dependencies that came installed in the environment:
{{dependencies}}
</DEPENDENCIES>

{{template}}`;

const PERSPECTIVES = [
    {
        name: 'Functionality & Logic',
        priorities: `
- REACT RENDER LOOPS & INFINITE LOOPS (CRITICAL)
- RUNTIME ERRORS & CRASHES (CRITICAL)
- LOGIC ERRORS & BROKEN FUNCTIONALITY (HIGH)
- DATA FLOW & STATE MANAGEMENT (MEDIUM-HIGH)
        `
    },
    {
        name: 'UI/UX & Accessibility',
        priorities: `
- UI RENDERING & LAYOUT ISSUES (HIGH)
- RESPONSIVE DESIGN & ADAPTIVE LAYOUTS (HIGH)
- ACCESSIBILITY (A11Y) COMPLIANCE (MEDIUM)
- CONSISTENT DESIGN SYSTEM USAGE (MEDIUM)
        `
    },
    {
        name: 'Performance & Security',
        priorities: `
- UNNECESSARY RE-RENDERS (MEDIUM)
- BUNDLE SIZE & DEP LOADING (LOW)
- INPUT VALIDATION & SECURITY (HIGH)
- PROPER ERROR BOUNDARIES (MEDIUM)
        `
    }
];

const SYNTHESIS_SYSTEM_PROMPT = `You are a Lead Software Architect. You will receive multiple code reviews from different specialized perspectives (Functionality, UI/UX, Performance).
Your task is to synthesize these reviews into a single, cohesive, and prioritized master review.

## SYNTHESIS RULES:
1. **De-duplicate issues**: If the same issue is mentioned in multiple reviews, consolidate it.
2. **Prioritize effectively**: Critical issues (crashes, render loops) MUST come first.
3. **Resolve conflicts**: If reviews suggest conflicting fixes, use your expert judgment to choose the best approach.
4. **Preserve specific fixes**: Ensure the actionable file-specific fixes are preserved and clear.
5. **Structure by file**: The final output MUST be structured by file path to enable parallel fixes.

${PROMPT_UTILS.COMMANDS}
{{template}}`;

const USER_PROMPT_TEMPLATE = `
<REPORTED_ISSUES>
{{issues}}
</REPORTED_ISSUES>

<CURRENT_CODEBASE>
{{context}}
</CURRENT_CODEBASE>

<ANALYSIS_INSTRUCTIONS>
Perform a deep-dive analysis focusing specifically on **{{perspective_name}}**.
Identify all issues, prioritize them, and provide self-contained fixes for each affected file.
</ANALYSIS_INSTRUCTIONS>`;

export class CodeReviewOperation extends AgentOperation<CodeReviewInputs, CodeReviewOutputType> {
    async execute(
        inputs: CodeReviewInputs,
        options: OperationOptions
    ): Promise<CodeReviewOutputType> {
        const { issues } = inputs;
        const { env, logger, context } = options;

        logger.info("Performing comprehensive multi-perspective code review");

        // Get files context
        const filesContext = getFilesContext(context);
        const issuesText = issuesPromptFormatter(issues);

        // 1. Run specialized reviews in parallel
        logger.info(`Launching ${PERSPECTIVES.length} specialized review agents...`);

        const perspectivePromises = PERSPECTIVES.map(async (perspective) => {
            const systemPrompt = generalSystemPromptBuilder(BASE_SYSTEM_PROMPT, {
                query: context.query,
                blueprint: context.blueprint,
                templateDetails: context.templateDetails,
                dependencies: context.dependencies,
                extraVariables: {
                    perspective: perspective.name,
                    priorities: perspective.priorities,
                }
            });

            const userPrompt = USER_PROMPT_TEMPLATE
                .replaceAll('{{issues}}', issuesText)
                .replaceAll('{{context}}', filesContext)
                .replaceAll('{{perspective_name}}', perspective.name);

            const messages = [
                createSystemMessage(systemPrompt),
                createUserMessage(PROMPT_UTILS.verifyPrompt(userPrompt)),
            ];

            try {
                const { object: result } = await executeInference({
                    env: env,
                    messages,
                    schema: CodeReviewOutput,
                    agentActionName: "codeReview",
                    context: options.inferenceContext,
                    reasoning_effort: 'low', // Use low effort for specialized reviews
                });
                return { perspective: perspective.name, result };
            } catch (error) {
                logger.error(`Error in ${perspective.name} review:`, error);
                return { perspective: perspective.name, result: null };
            }
        });

        const perspectiveResults = await Promise.all(perspectivePromises);
        const validResults = perspectiveResults.filter(r => r.result !== null).map(r => r.result);

        if (validResults.length === 0) {
            throw new Error("All code review perspectives failed");
        }

        // 2. Synthesize the results
        logger.info("Synthesizing multi-perspective results into master review...");

        const synthesisMessages = [
            createSystemMessage(generalSystemPromptBuilder(SYNTHESIS_SYSTEM_PROMPT, {
                query: context.query,
                blueprint: context.blueprint,
                templateDetails: context.templateDetails,
                dependencies: context.dependencies,
            })),
            createUserMessage(`Here are the individual specialized reviews. Please synthesize them into a single coherent CodeReviewOutput:
            
            ${JSON.stringify(perspectiveResults, null, 2)}
            `),
        ];

        try {
            const { object: finalReview } = await executeInference({
                env: env,
                messages: synthesisMessages,
                schema: CodeReviewOutput,
                agentActionName: "codeReview",
                context: options.inferenceContext,
                reasoning_effort: 'medium', // Use more effort for synthesis
            });

            if (!finalReview) {
                throw new Error("Failed to synthesize code review results");
            }

            logger.info(`Code review synthesized successfully. Found issues in ${finalReview.filesToFix.length} files.`);
            return finalReview;
        } catch (error) {
            logger.error("Error during code review synthesis:", error);
            // Fallback: return the first valid result if synthesis fails
            if (validResults[0]) {
                logger.warn("Returning first valid specialized review as fallback due to synthesis failure");
                return validResults[0] as CodeReviewOutputType;
            }
            throw error;
        }
    }
}

/**
 * Get files context for review
 */
function getFilesContext(context: GenerationContext): string {
    const files = context.allFiles;
    const filesObject = { files };

    return TemplateRegistry.markdown.serialize(
        filesObject,
        z.object({
            files: z.array(FileOutputSchema)
        })
    );
}