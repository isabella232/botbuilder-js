// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { DialogManager } from 'botbuilder-dialogs';
import { ResourceExplorer } from 'botbuilder-dialogs-declarative';

import {
    ActivityHandler,
    BotTelemetryClient,
    ConversationState,
    SkillConversationIdFactoryBase,
    SkillHttpClient,
    UserState,
} from 'botbuilder';

import {
    AdaptiveDialog,
    LanguageGeneratorExtensions,
    LanguagePolicy,
    ResourceExtensions,
    SkillExtensions,
    useTelemetry,
} from 'botbuilder-dialogs-adaptive';

export class CoreBot extends ActivityHandler {
    constructor(
        resourceExplorer: ResourceExplorer,
        userState: UserState,
        conversationState: ConversationState,
        skillClient: SkillHttpClient,
        skillConversationIdFactory: SkillConversationIdFactoryBase,
        botTelemetryClient: BotTelemetryClient,
        defaultLocale: string,
        defaultRootDialog: string
    ) {
        super();

        const rootResource = resourceExplorer.getResource(defaultRootDialog);
        const rootDialog = resourceExplorer.loadType<AdaptiveDialog>(rootResource);

        const dialogManager = new DialogManager(rootDialog).configure({
            conversationState,
            userState,
        });

        ResourceExtensions.useResourceExplorer(dialogManager, resourceExplorer);
        LanguageGeneratorExtensions.useLanguageGeneration(dialogManager);
        LanguageGeneratorExtensions.useLanguagePolicy(dialogManager, new LanguagePolicy(defaultLocale));
        SkillExtensions.useSkillClient(dialogManager, skillClient);
        SkillExtensions.useSkillConversationIdFactory(dialogManager, skillConversationIdFactory);
        useTelemetry(dialogManager, botTelemetryClient);

        this.onTurn(async (turnContext) => {
            await dialogManager.onTurn(turnContext);
            await conversationState.saveChanges(turnContext, false);
            await userState.saveChanges(turnContext, false);
        });
    }
}
