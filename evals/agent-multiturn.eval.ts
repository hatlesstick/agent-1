import {evaluate} from "@lmnr-ai/lmnr";
import { llmJudge } from './evaluators'

import type {MultiTurnEvalData, MultiTurnDatasetEntry, MultiTurnResult, MultiTurnTarget} from "./types.ts";

import dataset from "./data/agent-multiturn.json" with {type: "json"};

import {multiTurnExecutorWithMocks} from "./executors.ts";

const executor = async (data: MultiTurnEvalData) => {
    return multiTurnExecutorWithMocks(data)
}

evaluate({
    data: dataset as unknown as MultiTurnDatasetEntry[],
    executor,
    evaluators: {
        outputQuality: (output: MultiTurnResult, target?: MultiTurnTarget) => {
            if (!target) return 1
            return llmJudge(output, target)
        }
    },
    config: {
        projectApiKey: process.env.LMNR_PROJECT_API_KEY,
    },
    groupName: 'agent-multiturn',
})