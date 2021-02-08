/**
 * @module botbuilder-dialogs-adaptive
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { Dialog, TurnPath } from 'botbuilder-dialogs';
import { Expression, ExpressionParserInterface } from 'adaptive-expressions';
import { AdaptiveEvents } from '../adaptiveEvents';
import { OnDialogEvent, OnDialogEventConfiguration } from './onDialogEvent';

export interface OnChooseEntityConfiguration extends OnDialogEventConfiguration {
    property?: string;
    entity?: string;
}

/**
 * Triggered to choose between different possible entity resolutions.
 */
export class OnChooseEntity extends OnDialogEvent implements OnChooseEntityConfiguration {
    public static readonly $kind = 'Microsoft.OnChooseEntity';

    /**
     * Initializes a new instance of the [OnChooseEntity](xref:botbuilder-dialogs-adaptive.OnChooseEntity) class.
     * @param property Optional. Property to be assigned for filtering events.
     * @param entity Optional. Entity name being assigned for filtering events.
     * @param actions Optional. A [Dialog](xref:botbuilder-dialogs.Dialog) list containing the actions to add to the plan when the rule constraints are met.
     * @param condition Optional. Condition which needs to be met for the actions to be executed.
     */
    public constructor(property?: string, entity?: string, actions: Dialog[] = [], condition?: string) {
        super(AdaptiveEvents.chooseEntity, actions, condition);
        this.property = property;
        this.entity = entity;
    }

    /**
     * Gets or sets the property to be assigned for filtering events.
     */
    public property: string;

    /**
     * Gets or sets the entity name being assigned for filtering events.
     */
    public entity: string;

    /**
     * Get the expression for this rule.
     * @param parser [ExpressionParserInterface](xref:adaptive-expressions.ExpressionParserInterface) used to parse a string into an [Expression](xref:adaptive-expressions.Expression).
     * @returns [Expression](xref:adaptive-expressions.Expression) which will be cached and used to evaluate this rule.
     */
    public getExpression(parser: ExpressionParserInterface): Expression {
        const expressions = [super.getExpression(parser)];
        if (this.property) {
            expressions.push(parser.parse(`${TurnPath.dialogEvent}.value.property == '${this.property}'`));
        }
        if (this.entity) {
            expressions.push(parser.parse(`${TurnPath.dialogEvent}.value.entity.name == '${this.entity}'`));
        }

        return Expression.andExpression.apply(Expression, expressions);
    }
}
