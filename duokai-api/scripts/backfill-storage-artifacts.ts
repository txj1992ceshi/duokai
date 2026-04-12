import { backfillStorageArtifacts } from '../src/lib/storageBackfill.js';

const dryRun = process.argv.includes('--dry-run');

backfillStorageArtifacts({ dryRun })
  .then((result) => {
    console.log(JSON.stringify({ success: true, result }, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2
      )
    );
    process.exit(1);
  });
