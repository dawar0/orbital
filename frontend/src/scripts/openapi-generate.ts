import { env } from "#/lib/env";

const specUrl = `${env.VITE_API_BASE_URL}/openapi.json`;

const args = [
	"bunx",
	"--bun",
	"@openapi-qraft/cli",
	"--plugin",
	"tanstack-query-react",
	"--plugin",
	"openapi-typescript",
	"--output-dir",
	"src/lib/api",
	specUrl,
];

const subprocess = Bun.spawn({
	cmd: args,
	stdout: "inherit",
	stderr: "inherit",
});

const exitCode = await subprocess.exited;

if (exitCode !== 0) {
	process.exit(exitCode);
}
