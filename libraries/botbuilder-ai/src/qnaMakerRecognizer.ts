/**
 * @module botbuilder-dialogs-adaptive
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ArrayExpression,
    ArrayExpressionConverter,
    BoolExpression,
    BoolExpressionConverter,
    Expression,
    IntExpression,
    IntExpressionConverter,
    NumberExpression,
    NumberExpressionConverter,
    ObjectExpression,
    ObjectExpressionConverter,
    StringExpression,
    StringExpressionConverter,
} from 'adaptive-expressions';
import { RecognizerResult, Activity, getTopScoringIntent } from 'botbuilder-core';
import { Converter, ConverterFactory, DialogContext, Recognizer, RecognizerConfiguration } from 'botbuilder-dialogs';
import omit from 'lodash/omit';
import { QnAMaker, QnAMakerClient, QnAMakerClientKey } from './qnaMaker';
import {
    JoinOperator,
    QnAMakerEndpoint,
    QnAMakerMetadata,
    QnAMakerOptions,
    QnAMakerResult,
    QnARequestContext,
    RankerTypes,
} from './qnamaker-interfaces';

const intentPrefix = 'intent=';

export interface QnAMakerRecognizerConfiguration extends RecognizerConfiguration {
    knowledgeBaseId?: string | Expression | StringExpression;
    hostname?: string | Expression | StringExpression;
    endpointKey?: string | Expression | StringExpression;
    top?: number | string | Expression | IntExpression;
    threshold?: number | string | Expression | NumberExpression;
    isTest?: boolean;
    rankerType?: string | Expression | StringExpression;
    strictFiltersJoinOperator?: JoinOperator;
    includeDialogNameInMetadata?: boolean | string | Expression | BoolExpression;
    metadata?: QnAMakerMetadata[] | string | Expression | ArrayExpression<QnAMakerMetadata>;
    context?: QnARequestContext | string | Expression | ObjectExpression<QnARequestContext>;
    qnaId?: number | string | Expression | IntExpression;
    logPersonalInformation?: boolean | string | Expression | BoolExpression;
}

/**
 * A recognizer which uses QnAMaker KB to recognize intents.
 */
export class QnAMakerRecognizer extends Recognizer implements QnAMakerRecognizerConfiguration {
    public static $kind = 'Microsoft.QnAMakerRecognizer';
    public static readonly qnaMatchIntent = 'QnAMatch';

    /**
     * Knowledgebase id of your QnA maker knowledgebase.
     */
    public knowledgeBaseId: StringExpression;

    /**
     * Host name of the QnA maker knowledgebase.
     */
    public hostname: StringExpression;

    /**
     * Endpoint key for the QnA service.
     */
    public endpointKey: StringExpression;

    /**
     * Number of results you want.
     */
    public top: IntExpression = new IntExpression(3);

    /**
     * Threshold for the results.
     */
    public threshold: NumberExpression = new NumberExpression(0.3);

    /**
     * A value indicating whether to call test or prod environment of knowledgebase.
     */
    public isTest: boolean;

    /**
     * Desired RankerType.
     */
    public rankerType: StringExpression = new StringExpression(RankerTypes.default);

    /**
     * A value used for Join operation of Metadata.
     */
    public strictFiltersJoinOperator: JoinOperator;

    /**
     * Whether to include the dialog name metadata for QnA context.
     */
    public includeDialogNameInMetadata: BoolExpression = new BoolExpression(true);

    /**
     * An expression to evaluate to set additional metadata name value pairs.
     */
    public metadata: ArrayExpression<QnAMakerMetadata>;

    /**
     * An expression to evaluate to set the context.
     */
    public context: ObjectExpression<QnARequestContext>;

    /**
     * An expression to evaluate to set QnAId parameter.
     */
    public qnaId: IntExpression = new IntExpression(0);

    /**
     * The flag to indicate if personal information should be logged in telemetry.
     */
    public logPersonalInformation: BoolExpression = new BoolExpression('=settings.telemetry.logPersonalInformation');

    public getConverter(property: keyof QnAMakerRecognizerConfiguration): Converter | ConverterFactory {
        switch (property) {
            case 'knowledgeBaseId':
                return new StringExpressionConverter();
            case 'hostname':
                return new StringExpressionConverter();
            case 'endpointKey':
                return new StringExpressionConverter();
            case 'top':
                return new IntExpressionConverter();
            case 'threshold':
                return new NumberExpressionConverter();
            case 'rankerType':
                return new StringExpressionConverter();
            case 'includeDialogNameInMetadata':
                return new BoolExpressionConverter();
            case 'metadata':
                return new ArrayExpressionConverter();
            case 'context':
                return new ObjectExpressionConverter<QnARequestContext>();
            case 'qnaId':
                return new IntExpressionConverter();
            case 'logPersonalInformation':
                return new BoolExpressionConverter();
            default:
                return super.getConverter(property);
        }
    }

    /**
     * Initializes a new instance of `QnAMakerRecognizer`.
     *
     * @param {string} hostname Hostname of QnAMaker KB.
     * @param {string} knowledgeBaseId Id of QnAMaker KB.
     * @param {string} endpointKey Endpoint key of QnAMaker KB.
     */
    public constructor(hostname?: string, knowledgeBaseId?: string, endpointKey?: string) {
        super();
        if (hostname) {
            this.hostname = new StringExpression(hostname);
        }
        if (knowledgeBaseId) {
            this.knowledgeBaseId = new StringExpression(knowledgeBaseId);
        }
        if (endpointKey) {
            this.endpointKey = new StringExpression(endpointKey);
        }
    }

    /**
     * Gets results of the call to QnA maker KB.
     *
     * @param {DialogContext} dc Context object containing information for a single turn of coversation with a user.
     * @param {Activity} activity The incoming activity received from the user. The text value is used as the query to QnA Maker.
     * @param {object} telemetryProperties Additional properties to be logged to telemetry.
     * @param {object} telemetryMetrics Additional metrics to be logged to telemetry.
     * @returns {Promise<RecognizerResult>} A promise resolving to the recognizer result
     */
    public async recognize(
        dc: DialogContext,
        activity: Activity,
        telemetryProperties?: { [key: string]: string },
        telemetryMetrics?: { [key: string]: number }
    ): Promise<RecognizerResult> {
        // identify matched intents
        const recognizerResult: RecognizerResult = {
            text: activity.text,
            intents: {},
            entities: {},
        };

        if (!activity.text) {
            recognizerResult.intents['None'] = { score: 1 };
            return recognizerResult;
        }

        const filters: QnAMakerMetadata[] = [];
        if (this.includeDialogNameInMetadata?.getValue(dc.state)) {
            const metadata: QnAMakerMetadata = {
                name: 'dialogName',
                value: dc.activeDialog?.id,
            };
            filters.push(metadata);
        }

        // if there is $qna.metadata set add to filters
        const externalMetadata: QnAMakerMetadata[] = this.metadata?.getValue(dc.state);
        if (externalMetadata) {
            filters.push(...externalMetadata);
        }

        // calling QnAMaker to get response
        const qnaMaker = this.getQnAMaker(dc);
        const qnaMakerOptions: QnAMakerOptions = {
            context: this.context?.getValue(dc.state),
            scoreThreshold: this.threshold?.getValue(dc.state),
            strictFilters: filters,
            top: this.top?.getValue(dc.state),
            qnaId: this.qnaId?.getValue(dc.state),
            rankerType: this.rankerType?.getValue(dc.state),
            isTest: this.isTest,
            strictFiltersJoinOperator: this.strictFiltersJoinOperator,
        };
        const answers = await qnaMaker.getAnswers(dc.context, qnaMakerOptions);

        if (answers?.length > 0) {
            let topAnswer: QnAMakerResult;
            for (let i = 0; i < answers.length; i++) {
                const answer = answers[i];
                if (!topAnswer || answer.score > topAnswer.score) {
                    topAnswer = answer;
                }
            }

            if (topAnswer.answer.trim().toLowerCase().startsWith(intentPrefix)) {
                recognizerResult.intents[topAnswer.answer.trim().substr(intentPrefix.length).trim()] = {
                    score: topAnswer.score,
                };
            } else {
                recognizerResult.intents[QnAMakerRecognizer.qnaMatchIntent] = { score: topAnswer.score };
            }

            recognizerResult.entities['answer'] = [topAnswer.answer];
            recognizerResult.entities['$instance'] = {
                answer: [
                    Object.assign(topAnswer, {
                        startIndex: 0,
                        endIndex: activity.text.length,
                    }),
                ],
            };
            recognizerResult['answers'] = answers;
        } else {
            recognizerResult.intents['None'] = { score: 1 };
        }
        this.trackRecognizerResult(
            dc,
            'QnAMakerRecognizerResult',
            this.fillRecognizerResultTelemetryProperties(recognizerResult, telemetryProperties, dc),
            telemetryMetrics
        );
        return recognizerResult;
    }

    /**
     * Gets an instance of `QnAMaker`.
     *
     * @deprecated Instead, favor using [QnAMakerRecognizer.getQnAMakerClient()](#getQnAMakerClient) to get instance of QnAMakerClient.
     * @param {DialogContext} dc The dialog context used to access state.
     * @returns {QnAMaker} A qna maker instance
     */
    protected getQnAMaker(dc: DialogContext): QnAMaker {
        const options: Array<[StringExpression, string]> = [
            [this.endpointKey, 'endpointKey'],
            [this.hostname, 'host'],
            [this.knowledgeBaseId, 'knowledgeBaseId'],
        ];

        const [endpointKey, host, knowledgeBaseId] = options.map(([expression, key]) => {
            const { value, error } = expression?.tryGetValue(dc.state) ?? {};
            if (!value || error) {
                throw new Error(`Unable to get a value for ${key} from state. ${error}`);
            }
            return value;
        });

        const endpoint: QnAMakerEndpoint = { endpointKey, host, knowledgeBaseId };
        const logPersonalInfo = this.logPersonalInformation.getValue(dc.state);
        return new QnAMaker(endpoint, {}, this.telemetryClient, logPersonalInfo);
    }

    /**
     * Gets an instance of [QnAMakerClient](xref:botbuilder-ai.QnAMakerClient)
     *
     * @param {DialogContext} dc The dialog context used to access state.
     * @returns {QnAMakerClient} An instance of QnAMakerClient.
     */
    protected getQnAMakerClient(dc: DialogContext): QnAMakerClient {
        const qnaClient = dc.context?.turnState?.get(QnAMakerClientKey);
        if (qnaClient) {
            return qnaClient;
        }

        const options: Array<[StringExpression, string]> = [
            [this.endpointKey, 'endpointKey'],
            [this.hostname, 'host'],
            [this.knowledgeBaseId, 'knowledgeBaseId'],
        ];

        const [endpointKey, host, knowledgeBaseId] = options.map(([expression, key]) => {
            const { value, error } = expression?.tryGetValue(dc.state) ?? {};
            if (!value || error) {
                throw new Error(`Unable to get a value for ${key} from state. ${error}`);
            }
            return value;
        });

        const endpoint: QnAMakerEndpoint = { endpointKey, host, knowledgeBaseId };
        const logPersonalInfo = this.logPersonalInformation.getValue(dc.state);
        return new QnAMaker(endpoint, {}, this.telemetryClient, logPersonalInfo);
    }

    /**
     * Uses the RecognizerResult to create a list of properties to be included when tracking the result in telemetry.
     *
     * @param {RecognizerResult} recognizerResult Recognizer result.
     * @param {Record<string, string>} telemetryProperties A list of properties to append or override the properties created using the RecognizerResult.
     * @param {DialogContext} dialogContext Dialog context.
     * @returns {Record<string, string>} A dictionary that can be included when calling the trackEvent method on the TelemetryClient.
     */
    protected fillRecognizerResultTelemetryProperties(
        recognizerResult: RecognizerResult,
        telemetryProperties: Record<string, string>,
        dialogContext: DialogContext
    ): Record<string, string> {
        if (!dialogContext) {
            throw new Error(
                'DialogContext needed for state in QnAMakerRecognizer.fillRecognizerResultTelemetryProperties method.'
            );
        }

        const { intent: topIntent, score: topScore } = getTopScoringIntent(recognizerResult);
        const properties: Record<string, string> = {
            TopIntent: Object.entries(recognizerResult.intents).length > 0 ? topIntent : undefined,
            TopIntentScore: Object.entries(recognizerResult.intents).length > 0 ? topScore.toString() : undefined,
            Intents:
                Object.entries(recognizerResult.intents).length > 0
                    ? JSON.stringify(recognizerResult.intents)
                    : undefined,
            Entities: recognizerResult.entities ? JSON.stringify(recognizerResult.entities) : undefined,
            AdditionalProperties: JSON.stringify(
                omit(recognizerResult, ['text', 'alteredText', 'intents', 'entities'])
            ),
        };

        const { value: logPersonalInformation } = this.logPersonalInformation.tryGetValue(dialogContext.state);
        if (logPersonalInformation && recognizerResult.text) {
            properties.Text = recognizerResult.text;
            properties.AlteredText = recognizerResult.alteredText;
        }

        // Additional properties can override "stock" properties.
        if (telemetryProperties) {
            return Object.assign({}, properties, telemetryProperties);
        }

        return properties;
    }
}
