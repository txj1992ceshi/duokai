const required = ['ADMIN_IDENTIFIER', 'ADMIN_PASSWORD'];
const optional = ['API_BASE'];

function read(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

const missingRequired = required.filter((name) => !read(name));
const missingOptional = optional.filter((name) => !read(name));

const report = {
  ok: missingRequired.length === 0,
  required: required.map((name) => ({ name, present: read(name) })),
  optional: optional.map((name) => ({ name, present: read(name) })),
  notes: [],
};

if (missingRequired.length > 0) {
  report.notes.push(
    `Missing required env: ${missingRequired.join(', ')}. ` +
      'These are required for smoke/slo checks.'
  );
}
if (missingOptional.length > 0) {
  report.notes.push(
    `Missing optional env: ${missingOptional.join(', ')}. ` +
      'Defaults to http://127.0.0.1:3100 if not provided.'
  );
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
