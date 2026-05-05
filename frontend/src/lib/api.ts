import { requestFn } from "@openapi-qraft/react";
import { queryClient } from "#/integrations/tanstack-query/root-provider";
import { createAPIClient } from "./api/index";
import { env } from "./env";

export const api = createAPIClient({
	requestFn,
	queryClient,
	baseUrl: env.VITE_API_BASE_URL,
});
