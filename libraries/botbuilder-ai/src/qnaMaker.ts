/**
 * @module botbuilder-ai
 */
/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BotTelemetryClient, NullTelemetryClient, TurnContext } from 'botbuilder-core';

import {
    FeedbackRecords,
    QnAMakerEndpoint,
    QnAMakerMetadata,
    QnAMakerOptions,
    QnAMakerResult,
    QnAMakerResults,
    RankerTypes,
} from './qnamaker-interfaces';
import { ActiveLearningUtils, GenerateAnswerUtils, TrainUtils } from './qnamaker-utils';
import { QnATelemetryConstants } from './qnaTelemetryConstants';

export const QNAMAKER_TRACE_TYPE = 'https://www.qnamaker.ai/schemas/trace';
export const QNAMAKER_TRACE_NAME = 'QnAMaker';
export const QNAMAKER_TRACE_LABEL = 'QnAMaker Trace';

/**
 * Turn state key for QnAMakerClient.
 */
export const QnAMakerClientKey = Symbol('QnAMakerClient');

/**
 * Client to access a QnA Maker knowledge base.
 */
export interface QnAMakerClient {
    /**
     * Generates an answer from the knowledge base.
     *
     * @param {TurnContext} turnContext The Turn Context that contains the user question to be queried against your knowledge base.
     * @param {QnAMakerOptions} options The options for the QnA Maker knowledge base. If null, constructor option is used for this instance.
     * @param {Record<string, string>} telemetryProperties Additional properties to be logged to telemetry with the QnaMessage event.
     * @param {Record<string, number>} telemetryMetrics Additional metrics to be logged to telemetry with the QnaMessage event.
     * @returns {Promise<QnAMakerResult[]>} A list of answers for the user query, sorted in decreasing order of ranking score.
     */
    getAnswers(
        turnContext: TurnContext,
        options?: QnAMakerOptions,
        telemetryProperties?: Record<string, string>,
        telemetryMetrics?: Record<string, number>
    ): Promise<QnAMakerResult[]>;

    /**
     * Generates an answer from the knowledge base.
     *
     * @param {TurnContext} turnContext The Turn Context that contains the user question to be queried against your knowledge base.
     * @param {QnAMakerOptions} options The options for the QnA Maker knowledge base. If null, constructor option is used for this instance.
     * @param {Record<string, string>} telemetryProperties Additional properties to be logged to telemetry with the QnaMessage event.
     * @param {Record<string, number>} telemetryMetrics Additional metrics to be logged to telemetry with the QnaMessage event.
     * @returns {Promise<QnAMakerResults>} A list of answers for the user query, sorted in decreasing order of ranking score.
     */
    getAnswersRaw(
        turnContext: TurnContext,
        options?: QnAMakerOptions,
        telemetryProperties?: Record<string, string>,
        telemetryMetrics?: Record<string, number>
    ): Promise<QnAMakerResults>;

    /**
     * Filters the ambiguous question for active learning.
     *
     * @param {QnAMakerResult[]} queryResult User query output.
     * @returns {QnAMakerResult[]} Filtered array of ambiguous question.
     */
    getLowScoreVariation(queryResult: QnAMakerResult[]): QnAMakerResult[];

    /**
     * Send feedback to the knowledge base.
     *
     * @param {FeedbackRecords} feedbackRecords Feedback records.
     */
    callTrain(feedbackRecords: FeedbackRecords): Promise<void>;
}

/**
 * Interface for adding telemetry logging capabilities to QnAMaker.
 */
export interface QnAMakerTelemetryClient {
    /**
     * Gets a value indicating whether determines whether to log personal information that came from the user.
     */
    readonly logPersonalInformation: boolean;

    /**
     * Gets the currently configured botTelemetryClient that logs the events.
     */
    readonly telemetryClient: BotTelemetryClient;

    /**
     * Calls the QnA Maker service to generate answer(s) for a question.
     *
     * @summary
     * Returns an array of answers sorted by score with the top scoring answer returned first.
     *
     * In addition to returning the results from QnA Maker, [getAnswers()](#getAnswers) will also
     * emit a trace activity that contains the QnA Maker results.
     *
     * @param {TurnContext} context The Turn Context that contains the user question to be queried against your knowledge base.
     * @param {QnAMakerOptions} options (Optional) The options for the QnA Maker knowledge base. If null, constructor option is used for this instance.
     * @param {object} telemetryProperties Additional properties to be logged to telemetry with the QnaMessage event.
     * @param {object} telemetryMetrics Additional metrics to be logged to telemetry with the QnaMessage event.
     * @returns {Promise<QnAMakerResult[]>} A promise resolving to the QnAMaker result
     */
    getAnswers(
        context: TurnContext,
        options?: QnAMakerOptions,
        telemetryProperties?: { [key: string]: string },
        telemetryMetrics?: { [key: string]: number }
    ): Promise<QnAMakerResult[]>;
}

/**
 * Query a QnA Maker knowledge base for answers and provide feedbacks.
 *
 * @summary
 * This class is used to make queries to a single QnA Maker knowledge base and return the result.
 *
 * Use this to process incoming messages with the [getAnswers()](#getAnswers) method.
 */
export class QnAMaker implements QnAMakerClient, QnAMakerTelemetryClient {
    private readonly _logPersonalInformation: boolean;
    private readonly _telemetryClient: BotTelemetryClient;

    private readonly _options: QnAMakerOptions;
    private readonly generateAnswerUtils: GenerateAnswerUtils;
    private readonly trainUtils: TrainUtils;

    /**
     * Creates a new QnAMaker instance.
     *
     * @param {QnAMakerEndpoint} endpoint The endpoint of the knowledge base to query.
     * @param {QnAMakerOptions} options (Optional) additional settings used to configure the instance.
     * @param {BotTelemetryClient} telemetryClient The BotTelemetryClient used for logging telemetry events.
     * @param {boolean} logPersonalInformation Set to true to include personally indentifiable information in telemetry events.
     */
    constructor(
        private readonly endpoint: QnAMakerEndpoint,
        options: QnAMakerOptions = {},
        telemetryClient?: BotTelemetryClient,
        logPersonalInformation?: boolean
    ) {
        if (!endpoint) {
            throw new TypeError('QnAMaker requires valid QnAMakerEndpoint.');
        }

        const {
            scoreThreshold = 0.3,
            top = 1,
            strictFilters = [] as QnAMakerMetadata[],
            metadataBoost = [] as QnAMakerMetadata[],
            timeout = 100000,
            rankerType = RankerTypes.default,
        } = options;

        this._options = {
            scoreThreshold,
            top,
            strictFilters,
            metadataBoost,
            timeout,
            rankerType,
        } as QnAMakerOptions;

        this.generateAnswerUtils = new GenerateAnswerUtils(this._options, this.endpoint);
        this.trainUtils = new TrainUtils(this.endpoint);

        this._telemetryClient = telemetryClient || new NullTelemetryClient();
        this._logPersonalInformation = logPersonalInformation || false;
    }

    // Gets a value indicating whether determines whether to log personal information that came from the user.
    public get logPersonalInformation(): boolean {
        return this._logPersonalInformation;
    }

    // Gets the currently configured botTelemetryClient that logs the events.
    public get telemetryClient(): BotTelemetryClient {
        return this._telemetryClient;
    }

    /**
     * Calls the QnA Maker service to generate answer(s) for a question.
     *
     * @summary
     * Returns an array of answers sorted by score with the top scoring answer returned first.
     *
     * In addition to returning the results from QnA Maker, [getAnswers()](#getAnswers) will also
     * emit a trace activity that contains the QnA Maker results.
     *
     * @param {TurnContext} context The Turn Context that contains the user question to be queried against your knowledge base.
     * @param {QnAMakerOptions} options (Optional) The options for the QnA Maker knowledge base. If null, constructor option is used for this instance.
     * @param {object} telemetryProperties Additional properties to be logged to telemetry with the QnaMessage event.
     * @param {object} telemetryMetrics Additional metrics to be logged to telemetry with the QnaMessage event.
     * @returns {Promise<QnAMakerResult>} A promise resolving to the QnAMaker result
     */
    public async getAnswers(
        context: TurnContext,
        options?: QnAMakerOptions,
        telemetryProperties?: { [key: string]: string },
        telemetryMetrics?: { [key: string]: number }
    ): Promise<QnAMakerResult[]> {
        if (!context) {
            throw new TypeError('QnAMaker.getAnswers() requires a TurnContext.');
        }

        const response = await this.getAnswersRaw(context, options, telemetryProperties, telemetryMetrics);

        if (!response) {
            return [];
        }

        return response.answers;
    }

    /**
     * Generates an answer from the knowledge base.
     *
     * @param {TurnContext} context The [TurnContext](xref:botbuilder-core.TurnContext) that contains the user question to be queried against your knowledge base.
     * @param {QnAMakerOptions} options Optional. The [QnAMakerOptions](xref:botbuilder-ai.QnAMakerOptions) for the QnA Maker knowledge base. If null, constructor option is used for this instance.
     * @param {object} telemetryProperties Optional. Additional properties to be logged to telemetry with the QnaMessage event.
     * @param {object} telemetryMetrics Optional. Additional metrics to be logged to telemetry with the QnaMessage event.
     * @returns {Promise<QnAMakerResults>} A list of answers for the user query, sorted in decreasing order of ranking score.
     */
    public async getAnswersRaw(
        context: TurnContext,
        options?: QnAMakerOptions,
        telemetryProperties?: { [key: string]: string },
        telemetryMetrics?: { [key: string]: number }
    ): Promise<QnAMakerResults> {
        if (!context) {
            throw new TypeError('QnAMaker.getAnswers() requires a TurnContext.');
        }

        const queryResult: QnAMakerResult[] = [] as QnAMakerResult[];
        const question: string = this.getTrimmedMessageText(context);
        const queryOptions: QnAMakerOptions = { ...this._options, ...options } as QnAMakerOptions;

        this.generateAnswerUtils.validateOptions(queryOptions);

        let result: QnAMakerResults;

        if (question.length > 0) {
            result = await this.generateAnswerUtils.queryQnaServiceRaw(this.endpoint, question, queryOptions);

            const sortedQnaAnswers: QnAMakerResult[] = GenerateAnswerUtils.sortAnswersWithinThreshold(
                result.answers,
                queryOptions
            );
            queryResult.push(...sortedQnaAnswers);
        }

        if (!result) {
            return result;
        }

        await Promise.all([
            // Log telemetry
            this.onQnaResults(queryResult, context, telemetryProperties, telemetryMetrics),
            this.generateAnswerUtils.emitTraceInfo(context, queryResult, queryOptions),
        ]);

        const qnaResponse: QnAMakerResults = {
            activeLearningEnabled: result.activeLearningEnabled,
            answers: queryResult,
        };

        return qnaResponse;
    }

    /**
     * Calls [generateAnswer()](#generateanswer) and sends the resulting answer as a reply to the user.
     *
     * @deprecated Instead, favor using [QnAMaker.getAnswers()](#getAnswers) to generate answers for a question.
     *
     * @summary
     * Returns a value of `true` if an answer was found and sent. If multiple answers are
     * returned the first one will be delivered.
     * @param {TurnContext} context Context for the current turn of conversation with the user.
     * @returns {Promise<boolean>} A promise resolving to true if an answer was sent
     */
    public async answer(context: TurnContext): Promise<boolean> {
        if (!context) {
            throw new TypeError('QnAMaker.answer() requires a TurnContext.');
        }

        const { top, scoreThreshold } = this._options;
        const question: string = this.getTrimmedMessageText(context);
        const answers: QnAMakerResult[] = await this.generateAnswer(question, top, scoreThreshold);

        await this.generateAnswerUtils.emitTraceInfo(context, answers, this._options);

        if (answers.length > 0) {
            await context.sendActivity({ text: answers[0].answer, type: 'message' });

            return true;
        }

        return false;
    }

    /**
     * Calls the QnA Maker service to generate answer(s) for a question.
     *
     * @deprecated Instead, favor using [QnAMaker.getAnswers()](#getAnswers) to generate answers for a question.
     *
     * @summary
     * Returns an array of answers sorted by score with the top scoring answer returned first.
     *
     * @param {string | undefined} question The question to answer.
     * @param {number} top (Optional) number of answers to return. Defaults to a value of `1`.
     * @param {number} scoreThreshold (Optional) minimum answer score needed to be considered a match to questions. Defaults to a value of `0.001`.
     * @returns {Promise<QnAMakerResult[]>} A promise resolving to the QnAMaker results
     */
    public async generateAnswer(
        question: string | undefined,
        top?: number,
        scoreThreshold?: number
    ): Promise<QnAMakerResult[]> {
        const trimmedAnswer: string = question ? question.trim() : '';

        if (trimmedAnswer.length > 0) {
            const result: QnAMakerResults = await this.callService(
                this.endpoint,
                question,
                typeof top === 'number' ? top : 1
            );
            const minScore: number = typeof scoreThreshold === 'number' ? scoreThreshold : 0.001;

            return result.answers
                .filter((ans: QnAMakerResult) => ans.score >= minScore)
                .sort((a: QnAMakerResult, b: QnAMakerResult) => b.score - a.score);
        }

        return [] as QnAMakerResult[];
    }

    /**
     * Filters the ambiguous question for active learning.
     *
     * @summary Returns a filtered array of ambiguous question.
     *
     * @param {QnAMakerResult[]} queryResult User query output.
     * @returns {QnAMakerResult[]} the filtered results
     */
    public getLowScoreVariation(queryResult: QnAMakerResult[]): QnAMakerResult[] {
        return ActiveLearningUtils.getLowScoreVariation(queryResult);
    }

    /**
     * Send feedback to the knowledge base.
     *
     * @param {FeedbackRecords} feedbackRecords Feedback records.
     * @returns {Promise<void>} A promise representing the async operation
     */
    public async callTrain(feedbackRecords: FeedbackRecords): Promise<void> {
        return await this.trainUtils.callTrain(feedbackRecords);
    }

    /**
     * Called internally to query the QnA Maker service.
     *
     * @summary This is exposed to enable better unit testing of the service.
     *
     * @param {QnAMakerEndpoint} endpoint the qna maker endpoint
     * @param {string} question the question
     * @param {number} top number of results to return
     * @returns {Promise<QnAMakerResult>} a promise resolving to the qna maker results
     */
    protected async callService(endpoint: QnAMakerEndpoint, question: string, top: number): Promise<QnAMakerResults> {
        return this.generateAnswerUtils.queryQnaServiceRaw(endpoint, question, { top } as QnAMakerOptions);
    }

    /**
     * Invoked prior to a QnaMessage Event being logged.
     *
     * @param {QnAMakerResult[]} qnaResults The QnA Results for the call.
     * @param {TurnContext} turnContext Context object containing information for a single turn of conversation with a user.
     * @param {object} telemetryProperties Additional properties to be logged to telemetry with the QnaMessage event.
     * @param {object} telemetryMetrics Additional metrics to be logged to telemetry with the QnaMessage event.
     * @returns {Promise<void>} A promise representing the async operation
     */
    protected async onQnaResults(
        qnaResults: QnAMakerResult[],
        turnContext: TurnContext,
        telemetryProperties?: { [key: string]: string },
        telemetryMetrics?: { [key: string]: number }
    ): Promise<void> {
        this.fillQnAEvent(qnaResults, turnContext, telemetryProperties, telemetryMetrics).then((data) => {
            this.telemetryClient.trackEvent({
                name: QnATelemetryConstants.qnaMessageEvent,
                properties: data[0],
                metrics: data[1],
            });
        });
        return;
    }

    /**
     * Fills the event properties for QnaMessage event for telemetry.
     * These properties are logged when the recognizer is called.
     *
     * @param {QnAMakerResult[]} qnaResults Last activity sent from user.
     * @param {TurnContext} turnContext Context object containing information for a single turn of conversation with a user.
     * @param {object} telemetryProperties Additional properties to be logged to telemetry with the QnaMessage event.
     * @param {object} telemetryMetrics Additional properties to be logged to telemetry with the QnaMessage event.
     * @returns {Promise<[object, object]>} A dictionary that is sent as properties to BotTelemetryClient.trackEvent method for the QnaMessage event.
     */
    protected async fillQnAEvent(
        qnaResults: QnAMakerResult[],
        turnContext: TurnContext,
        telemetryProperties?: { [key: string]: string },
        telemetryMetrics?: { [key: string]: number }
    ): Promise<[{ [key: string]: string }, { [key: string]: number }]> {
        let properties: { [key: string]: string } = {};
        let metrics: { [key: string]: number } = {};

        properties[QnATelemetryConstants.knowledgeBaseIdProperty] = this.endpoint.knowledgeBaseId;

        const text = turnContext.activity.text;
        const userName = 'from' in turnContext.activity ? turnContext.activity.from.name : '';
        // Use the LogPersonalInformation flag to toggle logging PII data, text is a common example
        if (this.logPersonalInformation) {
            if (text) {
                properties[QnATelemetryConstants.questionProperty] = text;
            }
            if (userName) {
                properties[QnATelemetryConstants.usernameProperty] = userName;
            }
        }

        // Fill in Qna Results (found or not)
        if (qnaResults.length > 0) {
            const queryResult = qnaResults[0];
            properties[QnATelemetryConstants.matchedQuestionProperty] = JSON.stringify(queryResult.questions);
            properties[QnATelemetryConstants.questionIdProperty] = String(queryResult.id);
            properties[QnATelemetryConstants.answerProperty] = queryResult.answer;
            metrics[QnATelemetryConstants.scoreMetric] = queryResult.score;
            properties[QnATelemetryConstants.articleFoundProperty] = 'true';
        } else {
            properties[QnATelemetryConstants.matchedQuestionProperty] = 'No Qna Question matched';
            properties[QnATelemetryConstants.questionIdProperty] = 'No Qna Question Id matched';
            properties[QnATelemetryConstants.answerProperty] = 'No Qna Answer matched';
            properties[QnATelemetryConstants.articleFoundProperty] = 'false';
        }

        // Additional Properties can override "stock" properties.
        if (telemetryProperties != null) {
            properties = Object.assign({}, properties, telemetryProperties);
        }

        // Additional Metrics can override "stock" metrics.
        if (telemetryMetrics != null) {
            metrics = Object.assign({}, metrics, telemetryMetrics);
        }

        return [properties, metrics];
    }

    // Gets the message from the Activity in the TurnContext, trimmed of whitespaces.
    private getTrimmedMessageText(context: TurnContext): string {
        return context?.activity?.text?.trim() ?? '';
    }
}
