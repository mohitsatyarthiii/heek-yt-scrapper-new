import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, "sessions", "x-session.json");
const EMAIL_REGEX = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;

function extractEmail(text) {
  if (!text) return null;
  const match = text.match(EMAIL_REGEX);
  return match ? match[0] : null;
}

function parseFollowerCount(text) {
  if (!text) return 0;
  const clean = text.toLowerCase().replace(/followers?/i, "").trim();
  const match = clean.match(/([\d,.]+)\s*(k|m|b)?/i);
  if (!match) return 0;
  const num = parseFloat(match[1].replace(/,/g, ""));
  const suffix = (match[2] || "").toLowerCase();
  if (suffix === "b") return Math.round(num * 1_000_000_000);
  if (suffix === "m") return Math.round(num * 1_000_000);
  if (suffix === "k") return Math.round(num * 1_000);
  return Math.round(num);
}

export class XScraper {
  constructor() {
    this.browser = null;
    this.ownsBrowser = false;
  }

  async init(externalBrowser = null) {
    if (externalBrowser) {
      this.browser = externalBrowser;
      this.ownsBrowser = false;
    } else {
      this.browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      this.ownsBrowser = true;
    }
  }

  async loadSession() {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        const data = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8"));
        return data.cookies || [];
      }
    } catch { /* no session */ }
    return null;
  }

  async saveSession(context) {
    try {
      const cookies = await context.cookies();
      fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
      fs.writeFileSync(SESSION_FILE, JSON.stringify({ cookies }, null, 2));
    } catch { /* failed to save */ }
  }

  async manualLogin() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    await page.goto("https://x.com/i/flow/login");

    console.log("Please log in to X (Twitter) in the browser window...");
    console.log("Press Enter in this terminal once you are logged in.");

    await new Promise((resolve) => {
      process.stdin.once("data", resolve);
    });

    await this.saveSession(context);
    console.log("Session saved successfully!");
    await browser.close();
  }

  async scrape(keyword, { minSubs = 0, targetCount = 30, proxy, shouldStop, onProgress, onLog }) {
    if (!this.browser) await this.init();

    const log = onLog || (() => {});
    const cookies = await this.loadSession();
    if (!cookies) {
      log("No X session found. Run manual login first.");
      throw new Error("X login required. Run the manual login flow first via /x/login endpoint.");
    }

    const context = await this.browser.newContext({
      ...(proxy ? { proxy } : {}),
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: { width: 1280, height: 800 },
    });
    await context.addCookies(cookies);
    const page = await context.newPage();
    const results = [];

    try {
      // Search for people on X
      const searchUrl = `https://x.com/search?q=${encodeURIComponent(keyword)}&src=typed_query&f=user`;
      log(`Searching X for: ${keyword}`);
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(4000);

      // Collect profile links
      let profileUrls = new Set();
      let scrollAttempts = 0;
      const maxScrolls = Math.min(15, Math.ceil(targetCount / 5));

      while (profileUrls.size < targetCount * 2 && scrollAttempts < maxScrolls) {
        if (shouldStop && await shouldStop()) break;

        const links = await page.$$eval('a[href*="/"]', (anchors) => {
          const seen = new Set();
          return anchors
            .map((a) => a.href)
            .filter((href) => {
              // Match profile URLs like x.com/username (not /status/, /search, etc)
              const match = href.match(/x\.com\/([a-zA-Z0-9_]+)\/?$/);
              if (!match) return false;
              const username = match[1].toLowerCase();
              if (["home", "explore", "search", "notifications", "messages", "settings", "i", "compose"].includes(username)) return false;
              if (seen.has(username)) return false;
              seen.add(username);
              return true;
            });
        });

        for (const url of links) profileUrls.add(url.replace(/\/$/, ""));

        await page.evaluate(() => window.scrollBy(0, 800));
        await page.waitForTimeout(2000 + Math.random() * 2000);
        scrollAttempts++;
      }

      log(`Found ${profileUrls.size} profiles for "${keyword}"`);

      // Visit each profile
      for (const profileUrl of profileUrls) {
        if (shouldStop && await shouldStop()) break;
        if (results.length >= targetCount) break;

        try {
          await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
          await page.waitForTimeout(3000 + Math.random() * 3000);

          const profileData = await page.evaluate(() => {
            // Name
            const nameEl = document.querySelector('[data-testid="UserName"] span:first-child');
            const name = nameEl?.textContent?.trim() || "";

            // Handle
            const handleEl = document.querySelector('[data-testid="UserName"] span:nth-child(2)');
            const handle = handleEl?.textContent?.trim() || "";

            // Bio
            const bioEl = document.querySelector('[data-testid="UserDescription"]');
            const bio = bioEl?.textContent || "";

            // Location
            const locationEl = document.querySelector('[data-testid="UserProfileHeader_Items"] span[data-testid="UserLocation"]');
            const location = locationEl?.textContent?.trim() || "";

            // Website/link
            const linkEl = document.querySelector('[data-testid="UserProfileHeader_Items"] a[href*="t.co"], [data-testid="UserUrl"] a');
            const website = linkEl?.textContent || linkEl?.href || "";

            // Followers count
            const followersLink = document.querySelector('a[href*="/verified_followers"], a[href*="/followers"]');
            const followers = followersLink?.textContent || "";

            return { name, handle, bio: bio + " " + website, location, followers };
          });

          const followers = parseFollowerCount(profileData.followers);
          if (followers < minSubs) continue;

          const email = extractEmail(profileData.bio);
          if (!email) continue;

          const handle = profileData.handle.replace("@", "") || profileUrl.split("/").pop();

          results.push({
            channelId: handle,
            keyword,
            title: profileData.name,
            subscribers: followers,
            views: 0,
            videos: 0,
            country: profileData.location,
            email,
            source: "x",
            platform: "x",
            profileUrl,
            bio: profileData.bio.substring(0, 500),
          });

          log(`Found email for: ${profileData.name} (${followers.toLocaleString()} followers)`);
          if (onProgress) onProgress(results.length);
        } catch (err) {
          // Skip on error
        }

        // Conservative rate limiting: 10-18 second delay (X is aggressive)
        await page.waitForTimeout(10000 + Math.random() * 8000);
      }

      await this.saveSession(context);
    } finally {
      await context.close();
    }

    return results;
  }

  async cleanup() {
    if (this.browser && this.ownsBrowser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
