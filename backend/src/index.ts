import dotenv from "dotenv";
dotenv.config();

import { app } from "./app";
import { Database } from "./lib/database";
import { BlizzardApiClient } from "./lib/blizzard";

const PORT = process.env.PORT || 3001;
const database = Database.getInstance();
const blizzardClient = new BlizzardApiClient();

let server: ReturnType<typeof app.listen> | undefined;

async function start(): Promise<void> {
  await database.connect();
  void blizzardClient.initializeIfNeeded();

  server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("WCL VOD Review API ready");
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down gracefully`);

  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await database.disconnect();
  process.exit(0);
}

// Graceful shutdown
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
