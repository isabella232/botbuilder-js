/**
 * @module botbuilder-dialogs-adaptive
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    BoolExpression,
    BoolExpressionConverter,
    Expression,
    StringExpression,
    StringExpressionConverter,
    ValueExpression,
    ValueExpressionConverter,
} from 'adaptive-expressions';
import {
    Converter,
    ConverterFactory,
    Dialog,
    DialogConfiguration,
    DialogContext,
    DialogTurnResult,
} from 'botbuilder-dialogs';

export interface EmitEventConfiguration extends DialogConfiguration {
    eventName?: string | Expression | StringExpression;
    eventValue?: unknown | ValueExpression;
    bubbleEvent?: boolean | string | Expression | BoolExpression;
    disabled?: boolean | string | Expression | BoolExpression;
}

/**
 * Action which emits an event declaratively.
 */
export class EmitEvent<O extends object = {}> extends Dialog<O> implements EmitEventConfiguration {
    public static readonly $kind = 'Microsoft.EmitEvent';
  
    public constructor();

    /**
     * Initializes a new instance of the [EmitEvent](xref:botbuilder-dialogs-adaptive.EmitEvent) class.
     * @param eventName Name of the event to emit.
     * @param eventValue Optional. Memory property path to use to get the value to send as part of the event.
     * @param bubbleEvent Default = `false`. Value indicating whether the event should bubble to parents or not.
     */
    public constructor(eventName: string, eventValue?: string, bubbleEvent?: boolean);

    /**
     * Initializes a new instance of the [EmitEvent](xref:botbuilder-dialogs-adaptive.EmitEvent) class.
     * @param eventName Optional. Name of the event to emit.
     * @param eventValue Optional. Memory property path to use to get the value to send as part of the event.
     * @param bubbleEvent Default = `false`. Value indicating whether the event should bubble to parents or not.
     */
    public constructor(eventName?: string, eventValue?: string, bubbleEvent = false) {
        super();
        if (eventName) {
            this.eventName = new StringExpression(eventName);
        }
        if (eventValue) {
            this.eventValue = new ValueExpression(eventValue);
        }
        this.bubbleEvent = new BoolExpression(bubbleEvent);
    }

    /**
     * The name of the event to emit.
     */
    public eventName: StringExpression;

    /**
     * The memory property path to use to get the value to send as part of the event.
     */
    public eventValue: ValueExpression;

    /**
     * A value indicating whether gets or sets whether the event should bubble or not.
     */
    public bubbleEvent: BoolExpression;

    /**
     * An optional expression which if is true will disable this action.
     */
    public disabled?: BoolExpression;

    public getConverter(property: keyof EmitEventConfiguration): Converter | ConverterFactory {
        switch (property) {
            case 'eventName':
                return new StringExpressionConverter();
            case 'eventValue':
                return new ValueExpressionConverter();
            case 'bubbleEvent':
                return new BoolExpressionConverter();
            case 'disabled':
                return new BoolExpressionConverter();
            default:
                return super.getConverter(property);
        }
    }

    /**
     * Starts a new [Dialog](xref:botbuilder-dialogs.Dialog) and pushes it onto the dialog stack.
     * @param dc The [DialogContext](xref:botbuilder-dialogs.DialogContext) for the current turn of conversation.
     * @param options Optional. Initial information to pass to the dialog.
     * @returns A `Promise` representing the asynchronous operation.
     */
    public async beginDialog(dc: DialogContext, options?: O): Promise<DialogTurnResult> {
        if (this.disabled && this.disabled.getValue(dc.state)) {
            return await dc.endDialog();
        }

        let eventName: string;
        if (this.eventName) {
            eventName = this.eventName.getValue(dc.state);
        }

        let eventValue: any;
        if (this.eventValue) {
            eventValue = this.eventValue.getValue(dc.state);
        }

        let bubbleEvent = false;
        if (this.bubbleEvent) {
            bubbleEvent = this.bubbleEvent.getValue(dc.state);
        }

        let handled = false;
        if (dc.parent) {
            handled = await dc.parent.emitEvent(eventName, eventValue, bubbleEvent, false);
        } else {
            handled = await dc.emitEvent(eventName, eventValue, bubbleEvent, false);
        }

        return await dc.endDialog(handled);
    }

    /**
     * @protected
     * Builds the compute Id for the [Dialog](xref:botbuilder-dialogs.Dialog).
     * @returns A `string` representing the compute Id.
     */
    protected onComputeId(): string {
        return `EmitEvent[${this.eventName.toString() || ''}]`;
    }
}
