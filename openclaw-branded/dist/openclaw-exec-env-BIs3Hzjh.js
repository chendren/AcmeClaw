//#region src/infra/acmeclaw-exec-env.ts
const OPENCLAW_CLI_ENV_VAR = "OPENCLAW_CLI";
function markAcmeClawExecEnv(env) {
	return {
		...env,
		[OPENCLAW_CLI_ENV_VAR]: "1"
	};
}
//#endregion
export { markAcmeClawExecEnv as t };
