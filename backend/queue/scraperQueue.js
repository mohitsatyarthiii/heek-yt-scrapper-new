import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";

export const scraperQueue = new Queue("youtube-scraper", {
  connection: redisConnection,
});