import { router } from "./_core/trpc";
import { operantActionsRouter } from "./operantActionsRouter";
import { operantInsightRouter } from "./operantInsightRouter";
import { operantRecordsRouter } from "./operantRecordsRouter";
import { operantWorkspaceRouter } from "./operantWorkspaceRouter";
import { operantEventsRouter } from "./events/router";
import { operantGitHubRouter } from "./integrations/github/router";
import { operantDomainRouter } from "./domain/router";
import { operantReasoningRouter } from "./intelligence/router";

export const operantRouter = router({
  workspace: operantWorkspaceRouter,
  records: operantRecordsRouter,
  actions: operantActionsRouter,
  intelligence: operantInsightRouter,
  events: operantEventsRouter,
  integrations: router({ github: operantGitHubRouter }),
  world: operantDomainRouter,
  reasoning: operantReasoningRouter,
});
