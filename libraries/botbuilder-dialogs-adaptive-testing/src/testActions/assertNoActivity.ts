/**
 * @module botbuilder-dialogs-adaptive-testing
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TestAdapter, TurnContext } from 'botbuilder-core';
import { Inspector, TestAction } from '../testAction';

export interface AssertNoActivityConfiguration {
    description?: string;
}

/**
 * Basic assertion TestAction, which validates assertions against a reply activity.
 */
export class AssertNoActivity extends TestAction implements AssertNoActivityConfiguration {
    public static readonly $kind = 'Microsoft.Test.AssertNoActivity';

    /**
     * Description of this assertion.
     */
    public description: string;

    /**
     * Gets the text to assert for an activity.
     *
     * @returns Description.
     */
    public getConditionDescription(): string {
        return this.description ?? 'No activity';
    }

    /**
     * Execute the test.
     *
     * @param testAdapter Adapter to execute against.
     * @param callback Logic for the bot to use.
     * @param inspector Inspector for dialog context.
     */
    public async execute(
        adapter: TestAdapter,
        callback: (context: TurnContext) => Promise<void>,
        inspector?: Inspector
    ): Promise<void> {
        if (adapter.activeQueue.length > 0) {
            throw new Error(this.getConditionDescription());
        }
    }
}