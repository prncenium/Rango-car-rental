import { app } from './app.js';
import { connectDb } from './config/db.js';
import { env } from './config/env.js';

async function main(): Promise<void> {
  await connectDb();
  app.listen(env.PORT, () => {
    console.log(`Server listening on port ${env.PORT}`);
  });
}

main().catch((err: unknown) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
