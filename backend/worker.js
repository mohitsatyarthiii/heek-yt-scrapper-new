import dotenv from "dotenv";
import mongoose from "mongoose";
import axios from "axios";
import express from "express";
import cors from "cors";
import { YouTubeBrowserScraper } from "./scrapers/YouTubeBrowserScraper.js";
import { LinkedInScraper } from "./scrapers/LinkedInScraper.js";
import { InstagramScraper } from "./scrapers/InstagramScraper.js";
import { XScraper } from "./scrapers/XScraper.js";
import { YouTubeGoogleScraper } from "./scrapers/YouTubeGoogleScraper.js";
import { LinkedInGoogleScraper } from "./scrapers/LinkedInGoogleScraper.js";
import { InstagramGoogleScraper } from "./scrapers/InstagramGoogleScraper.js";
import { XGoogleScraper } from "./scrapers/XGoogleScraper.js";
import { BrowserPool } from "./lib/BrowserPool.js";
import { WorkerPool } from "./lib/WorkerPool.js";

dotenv.config();

// Prevent unhandled errors from crashing the process in production
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
  console.error(err.stack);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

/* ================= CONFIG ================= */

let COUNTRY = "";
let MIN_SUBS = 0;
let TARGET_PER_KEYWORD = 0;

// Proxy configuration from environment
const proxyConfig = (() => {
  if (process.env.PROXY_URL) return { url: process.env.PROXY_URL };
  if (process.env.PROXY_URLS) return { urls: process.env.PROXY_URLS.split(",").map(s => s.trim()).filter(Boolean) };
  return null;
})();

// Concurrent execution pools
const browserPool = new BrowserPool(parseInt(process.env.MAX_BROWSERS || "3"), proxyConfig);
const workerPool = new WorkerPool(parseInt(process.env.MAX_CONCURRENT_WORKERS || "5"));

// API Keys configuration — dynamically loads all YOUTUBE_API_KEY_N from env
const API_KEYS = [];
for (let i = 1; ; i++) {
  const key = process.env[`YOUTUBE_API_KEY_${i}`];
  if (!key) break;
  API_KEYS.push(key);
}

let currentKeyIndex = 0;
let quotaExceededKeys = new Set();
let lastKeyReset = Date.now();
let quotaUsage = new Map(); // key -> estimated units used today

/* ================= QUEUE SCHEMA ================= */

const queueSchema = new mongoose.Schema({
  keyword: { type: String, required: true },
  country: { type: String, default: "IN" },
  minSubs: { type: Number, default: 50000 },
  targetCount: { type: Number, default: 500 },
  source: {
    type: String,
    enum: ['youtube-api', 'youtube-browser', 'youtube-google', 'linkedin', 'linkedin-google', 'instagram', 'instagram-google', 'x', 'x-google'],
    default: 'youtube-api'
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'paused', 'failed'],
    default: 'pending'
  },
  groupId: { type: String, index: true },
  retryCount: { type: Number, default: 0 },
  maxRetries: { type: Number, default: 3 },
  progress: {
    collected: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  stats: {
    channelsFound: { type: Number, default: 0 },
    emailsFound: { type: Number, default: 0 },
    startTime: Date,
    endTime: Date,
    lastRun: Date
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const crawlerConfigSchema = new mongoose.Schema({
  name: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  currentKeyword: String,
  lastRun: Date,
  totalRuns: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const Queue = mongoose.model("Queue", queueSchema);
const CrawlerConfig = mongoose.model("CrawlerConfig", crawlerConfigSchema);

/* ================= DB CONNECT ================= */

await mongoose.connect(process.env.MONGO_URI);
console.log("MongoDB Connected");

/* ================= MODELS ================= */

const channelSchema = new mongoose.Schema(
  {
    channelId: { type: String, index: true },
    keyword: { type: String, index: true },
    title: String,
    subscribers: Number,
    views: Number,
    videos: Number,
    country: String,
    email: String,
    source: {
      type: String,
      enum: ['youtube-api', 'youtube-browser', 'youtube-google', 'linkedin', 'linkedin-google', 'instagram', 'instagram-google', 'x', 'x-google'],
      default: 'youtube-api'
    },
    platform: {
      type: String,
      enum: ['youtube', 'linkedin', 'instagram', 'x'],
      default: 'youtube'
    },
    profileUrl: String,
    bio: String,
  },
  { timestamps: true }
);
channelSchema.index({ channelId: 1, platform: 1 }, { unique: true });
channelSchema.index({ email: 1 });
channelSchema.index({ createdAt: -1 });

const logSchema = new mongoose.Schema(
  {
    message: String,
    keyword: String,
    type: { type: String, enum: ['info', 'success', 'error', 'warning'], default: 'info' }
  },
  { timestamps: true }
);

const Channel = mongoose.model("Channel", channelSchema);
const Log = mongoose.model("Log", logSchema);

/* ================= LOG FUNCTION ================= */

async function addLog(message, type = 'info', keyword = null) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] [${type.toUpperCase()}] ${message}`);
  await Log.create({ message, type, keyword });
}

/* ================= QUEUE FUNCTIONS ================= */

// Add keyword to queue (single source)
async function addToQueue(keyword, country, minSubs, targetCount, source = 'youtube-api', groupId = null) {
  const existing = await Queue.findOne({
    keyword,
    source,
    status: { $in: ['pending', 'running'] }
  });

  if (existing) {
    return { success: false, message: `${source} already in queue for "${keyword}"` };
  }

  const queueItem = await Queue.create({
    keyword,
    country: country || COUNTRY,
    minSubs: minSubs || MIN_SUBS,
    targetCount: targetCount || TARGET_PER_KEYWORD,
    source,
    groupId,
    progress: { total: targetCount || TARGET_PER_KEYWORD }
  });

  return { success: true, queueItem };
}

// Add keyword with multiple sources (creates one queue item per source)
async function addToQueueMultiSource(keyword, country, minSubs, targetCount, sources) {
  const gid = new mongoose.Types.ObjectId().toString();
  const results = [];

  // Expand "-all" variants into component sources
  let expandedSources = [];
  for (const src of sources) {
    if (src === 'youtube-all') {
      expandedSources.push('youtube-api', 'youtube-browser', 'youtube-google');
    } else if (src === 'linkedin-all') {
      expandedSources.push('linkedin', 'linkedin-google');
    } else if (src === 'instagram-all') {
      expandedSources.push('instagram', 'instagram-google');
    } else if (src === 'x-all') {
      expandedSources.push('x', 'x-google');
    } else {
      expandedSources.push(src);
    }
  }
  expandedSources = [...new Set(expandedSources)]; // Deduplicate

  for (const source of expandedSources) {
    const result = await addToQueue(keyword, country, minSubs, targetCount, source, gid);
    results.push(result);
  }

  return results;
}

// Get next pending item from queue
async function getNextQueueItem() {
  return await Queue.findOneAndUpdate(
    { 
      status: 'pending',
      $or: [
        { 'stats.lastRun': { $exists: false } },
        { 'stats.lastRun': { $lt: new Date(Date.now() - 5 * 60 * 1000) } } // 5 min cooldown
      ]
    },
    { 
      status: 'running',
      'stats.startTime': new Date(),
      updatedAt: new Date()
    },
    { sort: { createdAt: 1 }, new: true }
  );
}

// Update queue progress
async function updateQueueProgress(queueId, collected, channelsFound, emailsFound) {
  await Queue.findByIdAndUpdate(queueId, {
    $set: {
      'progress.collected': collected,
      'stats.channelsFound': channelsFound,
      'stats.emailsFound': emailsFound,
      'stats.lastRun': new Date(),
      updatedAt: new Date()
    }
  });
}

// Complete queue item
async function completeQueueItem(queueId, collected) {
  await Queue.findByIdAndUpdate(queueId, {
    status: 'completed',
    'progress.collected': collected,
    'stats.endTime': new Date(),
    updatedAt: new Date()
  });
}

// Pause queue item
async function pauseQueueItem(queueId) {
  await Queue.findByIdAndUpdate(queueId, {
    status: 'paused',
    updatedAt: new Date()
  });
}

// Resume queue item
async function resumeQueueItem(queueId) {
  await Queue.findByIdAndUpdate(queueId, {
    status: 'pending',
    updatedAt: new Date()
  });
}

// Fail queue item (with auto-retry)
async function failQueueItem(queueId, error) {
  const item = await Queue.findById(queueId);
  if (!item) return;

  if (item.retryCount < item.maxRetries) {
    // Auto-retry: set back to pending with incremented retry count
    await Queue.findByIdAndUpdate(queueId, {
      status: 'pending',
      retryCount: item.retryCount + 1,
      updatedAt: new Date()
    });
    await addLog(`🔄 Retry ${item.retryCount + 1}/${item.maxRetries} for "${item.keyword}" [${item.source}]: ${error}`, 'warning', item.keyword);
  } else {
    // Permanently failed
    await Queue.findByIdAndUpdate(queueId, {
      status: 'failed',
      'stats.endTime': new Date(),
      updatedAt: new Date()
    });
    await addLog(`❌ Permanently failed after ${item.maxRetries} retries: ${error}`, 'error', item.keyword);
  }
}

/* ================= API KEY FUNCTIONS ================= */

function shouldResetQuotaTracking() {
  const now = Date.now();
  const lastReset = new Date(lastKeyReset);
  const today = new Date(now);
  
  return lastReset.getDate() !== today.getDate() ||
         lastReset.getMonth() !== today.getMonth() ||
         lastReset.getFullYear() !== today.getFullYear();
}

function resetQuotaTracking() {
  if (shouldResetQuotaTracking()) {
    quotaExceededKeys.clear();
    quotaUsage.clear();
    currentKeyIndex = 0;
    lastKeyReset = Date.now();
    console.log("🔄 New day - Reset quota tracking for all keys");
  }
}

function getNextApiKey() {
  resetQuotaTracking();

  if (quotaExceededKeys.size >= API_KEYS.length) {
    console.log("❌ ALL API KEYS HAVE EXCEEDED QUOTA!");
    return null;
  }

  let attempts = 0;
  const maxAttempts = API_KEYS.length * 2;

  while (attempts < maxAttempts) {
    const key = API_KEYS[currentKeyIndex];

    if (!quotaExceededKeys.has(key)) {
      return key;
    }

    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    attempts++;
  }

  return null;
}

// Round-robin: rotate to next available key after each use
function rotateToNextKey() {
  let attempts = 0;
  do {
    currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
    attempts++;
  } while (quotaExceededKeys.has(API_KEYS[currentKeyIndex]) && attempts < API_KEYS.length);
}

// Cost-aware key selection: use least-used keys for expensive ops
function getApiKeyForCost(cost) {
  resetQuotaTracking();

  const availableKeys = API_KEYS
    .map((key, idx) => ({ key, idx, usage: quotaUsage.get(key) || 0 }))
    .filter(k => !quotaExceededKeys.has(k.key));

  if (!availableKeys.length) return null;

  if (cost >= 100) {
    // Expensive op (search.list): use least-used key
    availableKeys.sort((a, b) => a.usage - b.usage);
  } else {
    // Cheap op (channels.list): use most-used key (save fresh keys for expensive ops)
    availableKeys.sort((a, b) => b.usage - a.usage);
  }

  const selected = availableKeys[0];
  quotaUsage.set(selected.key, selected.usage + cost);
  currentKeyIndex = selected.idx;
  return selected.key;
}

function markCurrentKeyQuotaExceeded() {
  const currentKey = API_KEYS[currentKeyIndex];
  quotaExceededKeys.add(currentKey);
  
  console.log(`⚠️ API Key ${currentKeyIndex + 1} quota exceeded. Moving to next key...`);
  console.log(`📊 Active keys: ${API_KEYS.length - quotaExceededKeys.size}/${API_KEYS.length}`);
  
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
}

/* ================= EMAIL EXTRACT ================= */

function extractEmail(text) {
  if (!text) return null;
  const match = text.match(
    /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi
  );
  return match ? match[0] : null;
}

/* ================= API REQUEST WITH RETRY ================= */

async function makeRequest(requestFn, retryCount = 0) {
  const maxRetries = API_KEYS.length * 2;

  try {
    const result = await requestFn();
    rotateToNextKey(); // Distribute load across keys
    return result;
  } catch (error) {
    if (error.response?.status === 403 &&
        error.response?.data?.error?.errors?.[0]?.reason === 'quotaExceeded') {

      markCurrentKeyQuotaExceeded();

      if (retryCount < maxRetries) {
        await addLog(`🔄 Retrying with next API key... (Attempt ${retryCount + 1}/${maxRetries})`, 'info');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await makeRequest(requestFn, retryCount + 1);
      } else {
        throw new Error("All API keys have exceeded quota");
      }
    }
    throw error;
  }
}

/* ================= SCRAPER ================= */

async function fetchChannels(queueItem) {
  const { keyword, country, minSubs, targetCount, _id } = queueItem;

  await addLog(`🔍 Searching: ${keyword}`, "info", keyword);

  let nextPageToken = null;
  let collected = 0;
  let totalChannelsFound = 0;
  let emailsFound = 0;
  let consecutiveErrors = 0;

  let pageCount = 0;
  const MAX_PAGES =1000; // prevents infinite loops

  while (collected < targetCount && pageCount < MAX_PAGES) {
    try {

      const currentItem = await Queue.findById(_id);
      if (!currentItem || currentItem.status === "paused") {
        await addLog(`⏸️ Paused: ${keyword}`, "warning", keyword);
        break;
      }

      // Bug 1 fix: get fresh key INSIDE the closure so retries use a new key
      const search = await makeRequest(async () => {
        const apiKey = getApiKeyForCost(100); // search.list = 100 quota units
        if (!apiKey) throw new Error("No API keys available");
        return await axios.get(
          "https://www.googleapis.com/youtube/v3/search",
          {
            params: {
              key: apiKey,
              q: keyword,
              type: "channel",
              part: "snippet",
              maxResults: 50,
              regionCode: country,
              pageToken: nextPageToken
            },
            timeout: 30000
          }
        );
      });

      const ids = search.data.items.map(i => i.snippet.channelId);
      if (!ids.length) break;

      // Bug 4 fix: pre-filter existing channels BEFORE the expensive channels.list call
      const existingChannels = await Channel.find(
        { channelId: { $in: ids } },
        { channelId: 1 }
      );
      const existingIds = new Set(existingChannels.map(c => c.channelId));
      const newIds = ids.filter(id => !existingIds.has(id));

      if (!newIds.length) {
        // All channels on this page already exist, skip to next page
        nextPageToken = search.data.nextPageToken;
        pageCount++;
        if (!nextPageToken) break;
        continue;
      }

      // Bug 1+5 fix: fresh key inside closure, use cost-aware selection
      const details = await makeRequest(async () => {
        const apiKey = getApiKeyForCost(Math.max(1, newIds.length)); // channels.list ~1 unit per channel
        if (!apiKey) throw new Error("No API keys available");
        return await axios.get(
          "https://www.googleapis.com/youtube/v3/channels",
          {
            params: {
              key: apiKey,
              id: newIds.join(","),
              part: "snippet,statistics"
            },
            timeout: 30000
          }
        );
      });

      for (const ch of details.data.items) {

        totalChannelsFound++;

        const subs = parseInt(ch.statistics.subscriberCount || 0);
        if (subs < minSubs) continue;

        const email = extractEmail(ch.snippet.description);

        if (!email) continue;

        // Email deduplication: skip if this email already exists
        const emailExists = await Channel.findOne({ email });
        if (emailExists) continue;

        emailsFound++;

        await Channel.create({
          channelId: ch.id,
          keyword,
          title: ch.snippet.title,
          subscribers: subs,
          views: parseInt(ch.statistics.viewCount || 0),
          videos: parseInt(ch.statistics.videoCount || 0),
          country: ch.snippet.country,
          email,
          source: 'youtube-api',
          platform: 'youtube',
        });

        collected++;

        await addLog(
          `✅ Saved: ${ch.snippet.title} (${subs.toLocaleString()} subs)`,
          "success",
          keyword
        );

        if (collected % 10 === 0) {
          await updateQueueProgress(_id, collected, totalChannelsFound, emailsFound);
        }

        if (collected >= targetCount) break;
      }

      nextPageToken = search.data.nextPageToken;
      pageCount++;

      if (!nextPageToken) break;

    } catch (error) {

      consecutiveErrors++;

      if (error.message === "All API keys have exceeded quota") {
        await addLog("❌ All API keys quota exceeded", "error", keyword);
        await failQueueItem(_id, "All keys quota exceeded");
        break;
      }

      await addLog(`❌ Error: ${error.message}`, "error", keyword);

      if (consecutiveErrors > 5) {
        await addLog("❌ Too many errors. Stopping.", "error", keyword);
        await failQueueItem(_id, "Too many errors");
        break;
      }

      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (collected >= targetCount) {

    await completeQueueItem(_id, collected);

    await addLog(
      `🎯 Completed ${keyword} → ${collected}/${targetCount} emails`,
      "success",
      keyword
    );

  } else {

    await updateQueueProgress(_id, collected, totalChannelsFound, emailsFound);

    await addLog(
      `⚠ Partial result: ${collected}/${targetCount}`,
      "warning",
      keyword
    );
  }

  return collected;
}

/* ================= BROWSER SCRAPERS (CONCURRENT) ================= */

// Save results with email deduplication (shared by all browser scrapers)
async function saveScraperResults(results, keyword) {
  let saved = 0;
  for (const result of results) {
    try {
      // Email dedup: skip if email already exists for any platform
      if (result.email) {
        const emailExists = await Channel.findOne({ email: result.email });
        if (emailExists) continue;
      }
      // Channel dedup: skip if channelId+platform already exists
      const exists = await Channel.findOne({ channelId: result.channelId, platform: result.platform });
      if (exists) continue;

      await Channel.create(result);
      saved++;
      await addLog(`✅ Saved: ${result.title} (${(result.subscribers || 0).toLocaleString()} ${result.platform === 'youtube' ? 'subs' : 'followers'})`, "success", keyword);
    } catch (err) {
      // Duplicate key or other error — skip silently
      if (err.code !== 11000) {
        await addLog(`⚠ Save error for ${result.title}: ${err.message}`, "warning", keyword);
      }
    }
  }
  return saved;
}

async function fetchChannelsBrowser(queueItem) {
  const { keyword, minSubs, targetCount, _id, country } = queueItem;
  const browserEntry = await browserPool.checkout();
  const proxy = browserPool.getProxy();

  try {
    const scraper = new YouTubeBrowserScraper();
    await scraper.init(browserEntry.browser);

    await addLog(`🌐 Starting YT browser scrape: ${keyword}`, "info", keyword);

    const results = await scraper.scrape(keyword, {
      minSubs, targetCount, country, proxy,
      shouldStop: async () => {
        const item = await Queue.findById(_id);
        return !item || item.status === "paused";
      },
      onProgress: async (count) => {
        await updateQueueProgress(_id, count, count, count);
      },
      onLog: async (msg) => {
        await addLog(msg, "info", keyword);
      },
    });

    const saved = await saveScraperResults(results, keyword);
    await completeQueueItem(_id, saved);
    await addLog(`🎯 YT browser complete: ${keyword} → ${saved} emails`, "success", keyword);
    return saved;
  } catch (error) {
    await addLog(`❌ YT browser error: ${error.message}`, "error", keyword);
    await failQueueItem(_id, error.message);
    return 0;
  } finally {
    browserPool.release(browserEntry);
  }
}

async function fetchChannelsGoogle(queueItem) {
  const { keyword, minSubs, targetCount, _id, country } = queueItem;
  const browserEntry = await browserPool.checkout();
  const proxy = browserPool.getProxy();

  try {
    const scraper = new YouTubeGoogleScraper();
    await scraper.init(browserEntry.browser);

    await addLog(`🔍 Starting YT Google scrape: ${keyword}`, "info", keyword);

    const results = await scraper.scrape(keyword, {
      minSubs, targetCount, country, proxy,
      shouldStop: async () => {
        const item = await Queue.findById(_id);
        return !item || item.status === "paused";
      },
      onProgress: async (count) => {
        await updateQueueProgress(_id, count, count, count);
      },
      onLog: async (msg) => {
        await addLog(msg, "info", keyword);
      },
    });

    const saved = await saveScraperResults(results, keyword);
    await completeQueueItem(_id, saved);
    await addLog(`🎯 YT Google complete: ${keyword} → ${saved} emails`, "success", keyword);
    return saved;
  } catch (error) {
    await addLog(`❌ YT Google error: ${error.message}`, "error", keyword);
    await failQueueItem(_id, error.message);
    return 0;
  } finally {
    browserPool.release(browserEntry);
  }
}

async function fetchProfilesBrowser(queueItem, platform) {
  const { keyword, minSubs, targetCount, _id } = queueItem;
  const browserEntry = await browserPool.checkout();
  const proxy = browserPool.getProxy();

  try {
    let scraper;
    switch (platform) {
      case 'linkedin': scraper = new LinkedInScraper(); break;
      case 'instagram': scraper = new InstagramScraper(); break;
      case 'x': scraper = new XScraper(); break;
      default:
        await failQueueItem(_id, `Unknown platform: ${platform}`);
        return 0;
    }

    await scraper.init(browserEntry.browser);
    await addLog(`🌐 Starting ${platform} scrape: ${keyword}`, "info", keyword);

    const results = await scraper.scrape(keyword, {
      minSubs, targetCount, proxy,
      shouldStop: async () => {
        const item = await Queue.findById(_id);
        return !item || item.status === "paused";
      },
      onProgress: async (count) => {
        await updateQueueProgress(_id, count, count, count);
      },
      onLog: async (msg) => {
        await addLog(msg, "info", keyword);
      },
    });

    const saved = await saveScraperResults(results, keyword);
    await completeQueueItem(_id, saved);
    await addLog(`🎯 ${platform} complete: ${keyword} → ${saved} emails`, "success", keyword);
    return saved;
  } catch (error) {
    await addLog(`❌ ${platform} error: ${error.message}`, "error", keyword);
    await failQueueItem(_id, error.message);
    return 0;
  } finally {
    browserPool.release(browserEntry);
  }
}

async function fetchProfilesGoogle(queueItem, platform) {
  const { keyword, minSubs, targetCount, _id } = queueItem;
  const browserEntry = await browserPool.checkout();

  try {
    let scraper;
    switch (platform) {
      case 'linkedin': scraper = new LinkedInGoogleScraper(); break;
      case 'instagram': scraper = new InstagramGoogleScraper(); break;
      case 'x': scraper = new XGoogleScraper(); break;
      default:
        await failQueueItem(_id, `Unknown Google scraper platform: ${platform}`);
        return 0;
    }

    await scraper.init(browserEntry.browser);
    await addLog(`🔍 Starting ${platform} Google scrape: ${keyword}`, "info", keyword);

    const proxy = browserPool.getProxy();
    const results = await scraper.scrape(keyword, {
      minSubs, targetCount, proxy,
      shouldStop: async () => {
        const item = await Queue.findById(_id);
        return !item || item.status === "paused";
      },
      onProgress: async (count) => {
        await updateQueueProgress(_id, count, count, count);
      },
      onLog: async (msg) => {
        await addLog(msg, "info", keyword);
      },
    });

    const saved = await saveScraperResults(results, keyword);
    await completeQueueItem(_id, saved);
    await addLog(`🎯 ${platform} Google complete: ${keyword} → ${saved} emails`, "success", keyword);
    return saved;
  } catch (error) {
    await addLog(`❌ ${platform} Google error: ${error.message}`, "error", keyword);
    await failQueueItem(_id, error.message);
    return 0;
  } finally {
    browserPool.release(browserEntry);
  }
}

/* ================= CONCURRENT WORKER DISPATCH ================= */

async function processQueueItem(queueItem) {
  const source = queueItem.source || 'youtube-api';
  switch (source) {
    case 'youtube-browser':
      return await fetchChannelsBrowser(queueItem);
    case 'youtube-google':
      return await fetchChannelsGoogle(queueItem);
    case 'linkedin':
      return await fetchProfilesBrowser(queueItem, 'linkedin');
    case 'linkedin-google':
      return await fetchProfilesGoogle(queueItem, 'linkedin');
    case 'instagram':
      return await fetchProfilesBrowser(queueItem, 'instagram');
    case 'instagram-google':
      return await fetchProfilesGoogle(queueItem, 'instagram');
    case 'x':
      return await fetchProfilesBrowser(queueItem, 'x');
    case 'x-google':
      return await fetchProfilesGoogle(queueItem, 'x');
    case 'youtube-api':
    default:
      return await fetchChannels(queueItem);
  }
}

function startWorkerPool() {
  workerPool.start({
    processItem: async (queueItem) => {
      await addLog(`▶️ Processing: ${queueItem.keyword} [${queueItem.source}]`, 'info', queueItem.keyword);
      return await processQueueItem(queueItem);
    },
    getNextItem: getNextQueueItem,
    onWorkerStart: async (workerId, queueItem) => {
      // Worker started
    },
    onWorkerDone: async (workerId, result, queueItem) => {
      await addLog(`✅ Worker #${workerId} done: ${queueItem.keyword} [${queueItem.source}] → ${result} results`, 'info', queueItem.keyword);
    },
    onWorkerError: async (workerId, error, queueItem) => {
      await addLog(`❌ Worker #${workerId} failed: ${queueItem.keyword} [${queueItem.source}]: ${error.message}`, 'error', queueItem.keyword);
      await failQueueItem(queueItem._id, error.message);
    },
  });
}

/* ================= EXPRESS ================= */

const app = express();

// CORS — configurable via CORS_ORIGINS env var (comma-separated), with sensible defaults
const allowedOrigins = [
  "https://crawler.heekentertainment.com",
  "https://heek-yt-scrapper-new.onrender.com",
  "http://localhost:5173",
  "http://localhost:4173",
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());

// Health check for deployment platforms (Render, Railway, etc.)
app.get("/health", (req, res) => {
  const poolStatus = browserPool.getStatus();
  res.json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    workers: workerPool.getStatus().activeWorkers,
    browsers: poolStatus.total,
    apiKeys: API_KEYS.length,
    proxy: poolStatus.proxy,
  });
});

// API Status endpoint
app.get("/api-status", (req, res) => {
  res.json({
    totalKeys: API_KEYS.length,
    activeKeys: API_KEYS.length - quotaExceededKeys.size,
    quotaExceededKeys: quotaExceededKeys.size,
    currentKeyIndex: currentKeyIndex + 1,
    lastKeyReset: new Date(lastKeyReset).toLocaleString(),
    isRunning: workerPool.isRunning,
    workers: workerPool.getStatus(),
    browserPool: browserPool.getStatus(),
    perKeyUsage: API_KEYS.map((key, i) => ({
      keyIndex: i + 1,
      estimatedUsage: quotaUsage.get(key) || 0,
      exhausted: quotaExceededKeys.has(key),
      remainingEstimate: 10000 - (quotaUsage.get(key) || 0)
    }))
  });
});

// Queue endpoints
// Get all queue items
app.get("/queue", async (req, res) => {
  try {
    const items = await Queue.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add keywords to queue (supports multi-source)
app.post("/queue/add", async (req, res) => {
  try {
    const { keywords, country, minSubs, target, source, sources } = req.body;

    const keywordList = Array.isArray(keywords) ? keywords : (keywords || '').split(',').map(k => k.trim()).filter(Boolean);
    const sourceList = sources
      ? (Array.isArray(sources) ? sources : [sources])
      : [source || 'youtube-api'];

    const allResults = [];
    for (const keyword of keywordList) {
      if (sourceList.length === 1 && !sourceList[0].includes('all')) {
        const result = await addToQueue(keyword, country, minSubs, target, sourceList[0]);
        allResults.push(result);
      } else {
        const results = await addToQueueMultiSource(keyword, country, minSubs, target, sourceList);
        allResults.push(...results);
      }
    }

    res.json({
      success: true,
      added: allResults.filter(r => r?.success).length,
      results: allResults
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete queue items
app.post("/queue/bulk-delete", async (req, res) => {
  try {
    const { ids } = req.body;
    const result = await Queue.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pause queue item
app.post("/queue/pause/:id", async (req, res) => {
  try {
    await pauseQueueItem(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resume queue item
app.post("/queue/resume/:id", async (req, res) => {
  try {
    await resumeQueueItem(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete queue item
app.delete("/queue/:id", async (req, res) => {
  try {
    await Queue.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear completed items
app.post("/queue/clear", async (req, res) => {
  try {
    await Queue.deleteMany({ status: 'completed' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Scraper control (concurrent worker pool)
app.post("/scraper/start", async (req, res) => {
  if (!workerPool.isRunning) {
    startWorkerPool();
    res.json({ message: "Worker pool started", isRunning: true });
  } else {
    res.json({ message: "Worker pool already running", isRunning: true });
  }
});

app.post("/scraper/stop", async (req, res) => {
  workerPool.stop();
  res.json({ message: "Worker pool stopped", isRunning: false });
});

app.get("/scraper/status", (req, res) => {
  const status = workerPool.getStatus();
  res.json({
    ...status,
    browserPool: browserPool.getStatus(),
  });
});

// Keyword stats
app.get("/keyword-stats", async (req, res) => {
  const stats = await Channel.aggregate([
    {
      $group: {
        _id: "$keyword",
        channelsFound: { $sum: 1 },
        emailsFound: { 
          $sum: { 
            $cond: [{ $ne: ["$email", null] }, 1, 0] 
          } 
        },
        avgSubs: { $avg: "$subscribers" },
        totalSubs: { $sum: "$subscribers" }
      }
    },
    { $sort: { channelsFound: -1 } }
  ]);
  
  const queueStats = await Queue.find().sort({ createdAt: -1 });
  
  res.json({ keywordStats: stats, queue: queueStats });
});

// Start scraper with keywords (supports multi-source)
app.post("/start", async (req, res) => {
  try {
    const { keywords, country, minSubs, target, source, sources } = req.body;

    // Handle both string and array formats for keywords
    const keywordList = Array.isArray(keywords) ? keywords : (keywords || '').split(',').map(k => k.trim()).filter(Boolean);
    if (!keywordList.length) {
      return res.status(400).json({ error: "No keywords provided" });
    }

    // Support both single `source` and multi `sources` array
    const sourceList = sources
      ? (Array.isArray(sources) ? sources : [sources])
      : [source || 'youtube-api'];

    resetQuotaTracking();

    const allResults = [];
    for (const keyword of keywordList) {
      if (sourceList.length === 1 && !sourceList[0].includes('all')) {
        // Single source — simple path
        const result = await addToQueue(keyword, country, minSubs, target, sourceList[0]);
        allResults.push(result);
      } else {
        // Multi-source — creates grouped queue items
        const results = await addToQueueMultiSource(keyword, country, minSubs, target, sourceList);
        allResults.push(...results);
      }
    }

    // Start worker pool if not running
    if (!workerPool.isRunning) {
      startWorkerPool();
    }

    res.json({
      message: "Keywords added to queue",
      added: allResults.filter(r => r?.success).length,
      results: allResults,
      apiStatus: {
        totalKeys: API_KEYS.length,
        activeKeys: API_KEYS.length - quotaExceededKeys.size
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/channels", async (req, res) => {
  const { keyword, platform, email } = req.query; // Add email param
  const query = {};
  
  if (keyword) query.keyword = keyword;
  if (platform) query.platform = platform;
  
  // Optional email filter (if specifically requested)
  if (email === 'true') {
    query.email = { $ne: null };
  } else if (email === 'false') {
    query.email = null;
  }
  // If email not specified, return all channels

  const data = await Channel.find(query)
    .sort({ subscribers: -1 })
    .limit(10000);
  res.json(data);
});
app.get("/keywords", async (req, res) => {
  try {
    const keywords = await Channel.distinct("keyword", {
      keyword: { $exists: true, $ne: null, $ne: "" }
    });
    res.json(keywords.sort());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/logs", async (req, res) => {
  const { keyword } = req.query;
  const query = {};
  if (keyword) query.keyword = keyword;
  
  const data = await Log.find(query)
    .sort({ createdAt: -1 })
    .limit(200);
  res.json(data);
});

app.get("/stats", async (req, res) => {
  try {
    const total = await Channel.countDocuments();
    const withEmail = await Channel.countDocuments({
      email: { $exists: true, $ne: null, $ne: "" }
    });
    const emailRate = total > 0 ? ((withEmail / total) * 100).toFixed(1) : 0;

    const topCountries = await Channel.aggregate([
      {
        $match: {
          country: { $exists: true, $ne: null, $ne: "" }
        }
      },
      {
        $group: {
          _id: "$country",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    const keywordBreakdown = await Channel.aggregate([
      {
        $group: {
          _id: "$keyword",
          count: { $sum: 1 },
          emails: { 
            $sum: { 
              $cond: [{ $ne: ["$email", null] }, 1, 0] 
            } 
          }
        }
      }
    ]);

    res.json({
      total,
      withEmail,
      emailRate,
      topCountries,
      keywordBreakdown
    });

  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: "Stats fetch failed" });
  }
});

app.get("/speed", async (req,res)=>{
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const count = await Channel.countDocuments({
    createdAt: { $gte: oneHourAgo }
  });
  res.json({ perHour: count });
});

// Manual login endpoints for social platform scrapers
app.post("/linkedin/login", async (req, res) => {
  try {
    const scraper = new LinkedInScraper();
    await scraper.manualLogin();
    res.json({ success: true, message: "LinkedIn session saved" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/instagram/login", async (req, res) => {
  try {
    const scraper = new InstagramScraper();
    await scraper.manualLogin();
    res.json({ success: true, message: "Instagram session saved" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/x/login", async (req, res) => {
  try {
    const scraper = new XScraper();
    await scraper.manualLogin();
    res.json({ success: true, message: "X session saved" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CSV Export endpoint
app.get("/channels/export", async (req, res) => {
  try {
    const { keyword, platform } = req.query;
    const query = { email: { $ne: null } };
    if (keyword) query.keyword = keyword;
    if (platform) query.platform = platform;

    const channels = await Channel.find(query).sort({ subscribers: -1 }).lean();

    const headers = ['Title', 'Email', 'Platform', 'Subscribers', 'Keyword', 'Country', 'ProfileURL', 'Source', 'CreatedAt'];
    const csvRows = [headers.join(',')];

    for (const ch of channels) {
      const row = [
        `"${(ch.title || '').replace(/"/g, '""')}"`,
        ch.email || '',
        ch.platform || 'youtube',
        ch.subscribers || 0,
        ch.keyword || '',
        `"${(ch.country || '').replace(/"/g, '""')}"`,
        ch.profileUrl || '',
        ch.source || 'youtube-api',
        ch.createdAt ? new Date(ch.createdAt).toISOString() : '',
      ];
      csvRows.push(row.join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="heek-creators-${Date.now()}.csv"`);
    res.send(csvRows.join('\n'));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Estimated completion endpoint
app.get("/scraper/estimates", async (req, res) => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await Channel.countDocuments({ createdAt: { $gte: oneHourAgo } });
    const ratePerMinute = recentCount / 60;

    const pendingItems = await Queue.find({ status: { $in: ['pending', 'running'] } });
    const totalRemaining = pendingItems.reduce((sum, item) => {
      const remaining = (item.targetCount || 0) - (item.progress?.collected || 0);
      return sum + Math.max(0, remaining);
    }, 0);

    const estimatedMinutes = ratePerMinute > 0 ? Math.ceil(totalRemaining / ratePerMinute) : null;

    res.json({
      ratePerHour: recentCount,
      ratePerMinute: Math.round(ratePerMinute * 10) / 10,
      totalRemaining,
      estimatedMinutes,
      estimatedCompletion: estimatedMinutes
        ? new Date(Date.now() + estimatedMinutes * 60000).toISOString()
        : null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔑 Loaded ${API_KEYS.length} API keys`);
  console.log(`📊 MongoDB Queue System Active`);
});

/* ================= AUTO START ================= */

// Initialize browser pool and start worker pool after server is ready
setTimeout(async () => {
  try {
    await browserPool.initialize();
    startWorkerPool();
  } catch (err) {
    console.error("Failed to initialize pools:", err.message);
  }
}, 3000);

/* ================= GRACEFUL SHUTDOWN ================= */

async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  // Stop accepting new work
  workerPool.stop();
  console.log("Worker pool stopped.");

  // Close all browsers
  try {
    await browserPool.shutdown();
    console.log("Browser pool shut down.");
  } catch (e) {
    console.error("Error shutting down browser pool:", e.message);
  }

  // Close MongoDB connection
  try {
    await mongoose.connection.close();
    console.log("MongoDB connection closed.");
  } catch (e) {
    console.error("Error closing MongoDB:", e.message);
  }

  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));