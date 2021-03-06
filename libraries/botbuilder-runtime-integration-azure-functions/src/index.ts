// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Activity, WebResponse } from 'botbuilder';
import type { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { Configuration, getRuntimeServices } from 'botbuilder-runtime';
import { IServices, ServiceCollection } from 'botbuilder-runtime-core';

// helper function to memoize the result of `func`
function memoize<T>(func: () => T): () => T {
    let result: T;

    return () => {
        result ??= func();
        return result;
    };
}

/**
 * Create azure function triggers using the azure restify integration.
 *
 * @param runtimeServices result of calling `once(() => getRuntimeServices(...))`
 * @returns azure function triggers for `module.exports`
 */
export function makeTriggers(
    runtimeServices: () => Promise<[ServiceCollection<IServices>, Configuration]>
): Record<string, AzureFunction> {
    const instances = memoize(async () => {
        const [services] = await runtimeServices();
        return services.mustMakeInstances('adapter', 'bot', 'channelServiceHandler');
    });

    return {
        messageTrigger: async (context: Context, req: HttpRequest) => {
            context.log('Messages endpoint triggerd.');

            try {
                const { adapter, bot } = await instances();

                await adapter.processActivity(req, context.res as WebResponse, async (turnContext) => {
                    await bot.run(turnContext);
                });
            } catch (err) {
                context.log.error(err);
                throw err;
            }

            context.log('Done.');
        },

        skillsTrigger: async function (context: Context, req: HttpRequest) {
            context.log('Skill replyToActivity endpoint triggered.');

            try {
                const { channelServiceHandler: skillHandler } = await instances();

                const conversationId = context.bindingData.conversationId;
                const activityId = context.bindingData.activityId;

                const authHeader = req.headers.authorization || req.headers.Authorization || '';
                const result = await skillHandler.handleReplyToActivity(
                    authHeader,
                    conversationId,
                    activityId,
                    JSON.parse(req.body) as Activity
                );

                const res = context.res as WebResponse;
                res.status(200);
                res.send(result);
                res.end();
            } catch (err) {
                context.log.error(err);
                throw err;
            }

            context.log('Done.');
        },
    };
}

/**
 * Create azure function triggers using the azure restify integration.
 *
 * @param applicationRoot application root directory
 * @param settingsDirectory settings directory
 * @returns azure function triggers for `module.exports`
 */
export function triggers(applicationRoot: string, settingsDirectory: string): Record<string, AzureFunction> {
    return makeTriggers(memoize(() => getRuntimeServices(applicationRoot, settingsDirectory)));
}
