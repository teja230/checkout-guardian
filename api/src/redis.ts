import Redis from "ioredis";

export const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
});

// Pub/sub channel for live run updates
export const CHANNEL_RUN_UPDATES = "run:updates";

export function publishRunUpdate(runId: string, data: any) {
  return redis.publish(
    CHANNEL_RUN_UPDATES,
    JSON.stringify({ runId, ...data })
  );
}

// Job queue for the Nova Act worker
export function enqueueRun(runId: string) {
  return redis.lpush("queue:runs", JSON.stringify({ runId }));
}
