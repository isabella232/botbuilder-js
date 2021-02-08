/**
 * @module botbuilder-dialogs-adaptive
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    EnumExpression,
    EnumExpressionConverter,
    Expression,
    ObjectExpression,
    ObjectExpressionConverter,
    StringExpression,
    StringExpressionConverter,
} from 'adaptive-expressions';
import { Activity } from 'botbuilder-core';
import {
    Choice,
    ChoiceFactory,
    ChoiceFactoryOptions,
    Converter,
    ConverterFactory,
    DialogContext,
    FindChoicesOptions,
    ListStyle,
    PromptCultureModels,
    recognizeChoices,
} from 'botbuilder-dialogs';
import { InputDialog, InputDialogConfiguration, InputState } from './inputDialog';
import { ChoiceSet } from './choiceSet';

export enum ChoiceOutputFormat {
    value = 'value',
    index = 'index',
}

export interface ChoiceInputOptions {
    choices: Choice[];
}

export interface ChoiceInputConfiguration extends InputDialogConfiguration {
    choices?: ChoiceSet | string | Expression | ObjectExpression<ChoiceSet>;
    style?: ListStyle | string | Expression | EnumExpression<ListStyle>;
    defaultLocale?: string | Expression | StringExpression;
    outputFormat?: ChoiceOutputFormat | string | Expression | EnumExpression<ChoiceOutputFormat>;
    choiceOptions?: ChoiceFactoryOptions | string | Expression | ObjectExpression<ChoiceFactoryOptions>;
    recognizerOptions?: FindChoicesOptions | string | Expression | ObjectExpression<FindChoicesOptions>;
}

/**
 * ChoiceInput - Declarative input to gather choices from user.
 */
export class ChoiceInput extends InputDialog implements ChoiceInputConfiguration {
    public static readonly $kind = 'Microsoft.ChoiceInput';

    /**
     * Default options for rendering the choices to the user based on locale.
     */
    private static defaultChoiceOptions: { [locale: string]: ChoiceFactoryOptions } = {
        'es-es': { inlineSeparator: ', ', inlineOr: ' o ', inlineOrMore: ', o ', includeNumbers: true },
        'nl-nl': { inlineSeparator: ', ', inlineOr: ' of ', inlineOrMore: ', of ', includeNumbers: true },
        'en-us': { inlineSeparator: ', ', inlineOr: ' or ', inlineOrMore: ', or ', includeNumbers: true },
        'fr-fr': { inlineSeparator: ', ', inlineOr: ' ou ', inlineOrMore: ', ou ', includeNumbers: true },
        'de-de': { inlineSeparator: ', ', inlineOr: ' oder ', inlineOrMore: ', oder ', includeNumbers: true },
        'ja-jp': { inlineSeparator: '、 ', inlineOr: ' または ', inlineOrMore: '、 または ', includeNumbers: true },
        'pt-br': { inlineSeparator: ', ', inlineOr: ' ou ', inlineOrMore: ', ou ', includeNumbers: true },
        'zh-cn': { inlineSeparator: '， ', inlineOr: ' 要么 ', inlineOrMore: '， 要么 ', includeNumbers: true },
    };

    /**
     * List of choices to present to user.
     */
    public choices: ObjectExpression<ChoiceSet> = new ObjectExpression();

    /**
     * Style of the "yes" and "no" choices rendered to the user when prompting.
     *
     * @remarks
     * Defaults to `ListStyle.auto`.
     */
    public style: EnumExpression<ListStyle> = new EnumExpression<ListStyle>(ListStyle.auto);

    /**
     * The prompts default locale that should be recognized.
     */
    public defaultLocale?: StringExpression;

    /**
     * Control the format of the response (value or index of the choice).
     */
    public outputFormat: EnumExpression<ChoiceOutputFormat> = new EnumExpression<ChoiceOutputFormat>(
        ChoiceOutputFormat.value
    );

    /**
     * Additional options passed to the `ChoiceFactory` and used to tweak the style of choices
     * rendered to the user.
     */
    public choiceOptions?: ObjectExpression<ChoiceFactoryOptions> = new ObjectExpression();

    /**
     * Additional options passed to the underlying `recognizeChoices()` function.
     */
    public recognizerOptions?: ObjectExpression<FindChoicesOptions> = new ObjectExpression();

    public getConverter(property: keyof ChoiceInputConfiguration): Converter | ConverterFactory {
        switch (property) {
            case 'choices':
                return new ObjectExpressionConverter<ChoiceSet>();
            case 'style':
                return new EnumExpressionConverter<ListStyle>(ListStyle);
            case 'defaultLocale':
                return new StringExpressionConverter();
            case 'outputFormat':
                return new EnumExpressionConverter<ChoiceOutputFormat>(ChoiceOutputFormat);
            case 'choiceOptions':
                return new ObjectExpressionConverter<ChoiceFactoryOptions>();
            case 'recognizerOptions':
                return new ObjectExpressionConverter<FindChoicesOptions>();
            default:
                return super.getConverter(property);
        }
    }

    /**
     * @protected
     * Method which processes options.
     * @param dc The [DialogContext](xref:botbuilder-dialogs.DialogContext) for the current turn of conversation.
     * @param options Optional, initial information to pass to the dialog.
     * @returns The modified [ChoiceInputOptions](xref:botbuilder-dialogs-adaptive.ChoiceInputOptions) options.
     */
    protected onInitializeOptions(dc: DialogContext, options: ChoiceInputOptions): ChoiceInputOptions {
        if (!(options && options.choices && options.choices.length > 0)) {
            if (!options) {
                options = { choices: [] };
            }
            const choices = this.choices.getValue(dc.state);
            options.choices = choices;
        }
        return super.onInitializeOptions(dc, options);
    }

    /**
     * @protected
     * Called when input has been received.
     * @param dc The [DialogContext](xref:botbuilder-dialogs.DialogContext) for the current turn of conversation.
     * @returns [InputState](xref:botbuilder-dialogs-adaptive.InputState) which reflects whether input was recognized as valid or not.
     */
    protected async onRecognizeInput(dc: DialogContext): Promise<InputState> {
        // Get input and options
        const input: string = dc.state.getValue(InputDialog.VALUE_PROPERTY).toString();
        const options: ChoiceInputOptions = dc.state.getValue(InputDialog.OPTIONS_PROPERTY);

        // Format choices
        const choices = ChoiceFactory.toChoices(options.choices);

        // Initialize recognizer options
        const opt = Object.assign({}, this.recognizerOptions.getValue(dc.state));
        opt.locale = this.determineCulture(dc, opt);

        // Recognize input
        const results = recognizeChoices(input, choices, opt);
        if (!Array.isArray(results) || results.length == 0) {
            return InputState.unrecognized;
        }

        // Format output and return success
        const foundChoice = results[0].resolution;
        switch (this.outputFormat.getValue(dc.state)) {
            case ChoiceOutputFormat.value:
            default:
                dc.state.setValue(InputDialog.VALUE_PROPERTY, foundChoice.value);
                break;
            case ChoiceOutputFormat.index:
                dc.state.setValue(InputDialog.VALUE_PROPERTY, foundChoice.index);
                break;
        }

        return InputState.valid;
    }

    /**
     * @protected
     * Method which renders the prompt to the user given the current input state.
     * @param dc The [DialogContext](xref:botbuilder-dialogs.DialogContext) for the current turn of conversation.
     * @param state Dialog [InputState](xref:botbuilder-dialogs-adaptive.InputState).
     * @returns An [Activity](xref:botframework-schema.Activity) `Promise` representing the asynchronous operation.
     */
    protected async onRenderPrompt(dc: DialogContext, state: InputState): Promise<Partial<Activity>> {
        // Determine locale
        let locale = this.determineCulture(dc);

        const choices = this.choices.getValue(dc.state);

        // Format prompt to send
        const prompt = await super.onRenderPrompt(dc, state);
        const channelId = dc.context.activity.channelId;
        const choiceOptions =
            (this.choiceOptions && this.choiceOptions.getValue(dc.state)) || ChoiceInput.defaultChoiceOptions[locale];
        const style = this.style.getValue(dc.state);
        return Promise.resolve(this.appendChoices(prompt, channelId, choices, style, choiceOptions));
    }

    /**
     * @protected
     */
    protected onComputeId(): string {
        return `ChoiceInput[${this.prompt && this.prompt.toString()}]`;
    }

    private determineCulture(dc: DialogContext, opt?: FindChoicesOptions): string {
        const optLocale = opt && opt.locale ? opt.locale : null;
        let culture = PromptCultureModels.mapToNearestLanguage(
            dc.context.activity.locale ||
            optLocale ||
            (this.defaultLocale && this.defaultLocale.getValue(dc.state)));

        if (!(culture && ChoiceInput.defaultChoiceOptions.hasOwnProperty(culture))) {
            culture = PromptCultureModels.English.locale;
        }

        return culture;
    }
}
