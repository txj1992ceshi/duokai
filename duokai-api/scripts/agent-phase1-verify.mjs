import { spawn } from 'node:child_process';

function hasEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

function runStep(name, cmd, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      env: process.env,
      shell: false,
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }
      reject(new Error(`[${name}] failed with exit code ${String(code)}`));
    });
    child.on('error', (error) => reject(error));
  });
}

async function main() {
  const strict = process.env.STRICT_AGENT_VERIFY === '1';
  const hasAdminIdentifier = hasEnv('ADMIN_IDENTIFIER') || hasEnv('ADMIN_EMAIL');
  const hasAdminPassword = hasEnv('ADMIN_PASSWORD');
  const canRunOnlineChecks = hasAdminIdentifier && hasAdminPassword;

  const report = {
    strict,
    canRunOnlineChecks,
    requiredEnv: {
      ADMIN_IDENTIFIER_or_ADMIN_EMAIL: hasAdminIdentifier,
      ADMIN_PASSWORD: hasAdminPassword,
    },
    steps: [],
  };

  const baseSteps = [
    ['lint', 'npm', ['run', 'lint']],
    ['test', 'npm', ['test']],
    ['build', 'npm', ['run', 'build']],
  ];
  for (const [name, cmd, args] of baseSteps) {
    // eslint-disable-next-line no-await-in-loop
    await runStep(name, cmd, args);
    report.steps.push({ name, status: 'passed' });
  }

  if (canRunOnlineChecks) {
    await runStep('smoke:agent', 'npm', ['run', 'smoke:agent']);
    report.steps.push({ name: 'smoke:agent', status: 'passed' });
    await runStep('slo:agent', 'npm', ['run', 'slo:agent']);
    report.steps.push({ name: 'slo:agent', status: 'passed' });
  } else {
    report.steps.push({
      name: 'smoke:agent',
      status: 'skipped',
      reason: 'Missing ADMIN_IDENTIFIER/ADMIN_EMAIL or ADMIN_PASSWORD',
    });
    report.steps.push({
      name: 'slo:agent',
      status: 'skipped',
      reason: 'Missing ADMIN_IDENTIFIER/ADMIN_EMAIL or ADMIN_PASSWORD',
    });
    if (strict) {
      throw new Error('Online checks required in strict mode, but required env is missing');
    }
  }

  console.log('\n[agent-phase1-verify] summary');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
