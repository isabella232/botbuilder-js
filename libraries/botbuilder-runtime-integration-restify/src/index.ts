// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as t from 'runtypes';
import restify from 'restify';
import { Configuration, getRuntimeServices } from 'botbuilder-runtime';
import { IServices, ServiceCollection } from 'botbuilder-runtime-core';

/**
 * Options for runtime restify adapter
 */
export type Options = {
    /**
     * Port that server should listen on
     */
    port: number;
};

const defaultOptions: Options = {
    port: 3978,
};

/**
 * Start a bot using the runtime restify integration.
 *
 * @param applicationRoot application root directory
 * @param settingsDirectory settings directory
 * @param options options bag
 */
export async function start(
    applicationRoot: string,
    settingsDirectory: string,
    options = defaultOptions
): Promise<void> {
    const [services, configuration] = await getRuntimeServices(applicationRoot, settingsDirectory);
    const server = await makeServer(services, configuration);

    server.listen(options.port, () => {
        console.log(`server listening on port ${options.port}`);
    });
}

/**
 * Create a server using the runtime restify integration.
 *
 * @param services runtime service collection
 * @param configuration runtime configuration
 * @returns a restify server ready to listen for connections
 */
export async function makeServer(
    services: ServiceCollection<IServices>,
    configuration: Configuration
): Promise<restify.Server> {
    const { adapter, bot, customAdapters } = await services.mustMakeInstances('adapter', 'bot', 'customAdapters');

    const server = restify.createServer();

    server.post('/api/messages', (req, res) => {
        adapter.processActivity(req, res, async (turnContext) => {
            await bot.run(turnContext);
        });
    });

    const adapters =
        (await configuration.type(
            ['runtimeSettings', 'adapters'],
            t.Array(
                t.Record({
                    name: t.String,
                    enabled: t.Union(t.Boolean, t.Undefined),
                    route: t.String,
                })
            )
        )) ?? [];

    adapters
        .filter((settings) => settings.enabled)
        .forEach((settings) => {
            const adapter = customAdapters.get(settings.name);
            if (adapter) {
                server.post(`/api/${settings.route}`, (req, res) => {
                    adapter.processActivity(req, res, async (turnContext) => {
                        await bot.run(turnContext);
                    });
                });
            } else {
                console.warn(`Custom Adapter for \`${settings.name}\` not registered.`);
            }
        });

    server.on('upgrade', async (req, socket, head) => {
        const adapter = await services.mustMakeInstance('adapter');
        adapter.useWebSocket(req, socket, head, async (context) => {
            await bot.run(context);
        });
    });

    return server;
}
