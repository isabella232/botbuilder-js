/**
 * @module botbuilder-dialogs-adaptive
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { Dialog, TurnPath } from 'botbuilder-dialogs';
import { ExpressionParserInterface, Expression, ExpressionType } from 'adaptive-expressions';
import { OnCondition, OnConditionConfiguration } from './onCondition';

export interface OnDialogEventConfiguration extends OnConditionConfiguration {
    event?: string;
}

/**
 * Actions triggered when a dialog event is emitted.
 */
export class OnDialogEvent extends OnCondition implements OnDialogEventConfiguration {
    public static readonly $kind = 'Microsoft.OnDialogEvent';

    /**
     * Gets or sets the event to fire on.
     */
    public event: string;

    /**
     * Creates a new `OnDialogEvent` instance.
     * @param event (Optional) The event to fire on.
     * @param actions (Optional) The actions to add to the plan when the rule constraints are met.
     * @param condition (Optional) The condition which needs to be met for the actions to be executed.
     */
    public constructor(event?: string, actions: Dialog[] = [], condition?: string) {
        super(condition, actions);
        this.event = event;
    }

    /**
     * Get the expression for this rule.
     * @param parser [ExpressionParserInterface](xref:adaptive-expressions.ExpressionParserInterface) used to parse a string into an [Expression](xref:adaptive-expressions.Expression).
     * @returns [Expression](xref:adaptive-expressions.Expression) which will be cached and used to evaluate this rule.
     */
    public getExpression(parser: ExpressionParserInterface): Expression {
        return Expression.makeExpression(
            ExpressionType.And,
            undefined,
            parser.parse(`${TurnPath.dialogEvent}.name == '${this.event}'`),
            super.getExpression(parser)
        );
    }
}
