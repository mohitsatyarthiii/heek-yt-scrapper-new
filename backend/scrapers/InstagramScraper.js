import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, "sessions", "instagram-session.json");
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

export class InstagramScraper {
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
    await page.goto("https://www.instagram.com/accounts/login/");

    console.log("Please log in to Instagram in the browser window...");
    console.log("Press Enter in this terminal once you are logged in.");

    await new Promise((resolve) => {
      process.stdin.once("data", resolve);
    });

    await this.saveSession(context);
    console.log("Session saved successfully!");
    await browser.close();
  }

  async scrape(keyword, { minSubs = 0, targetCount = 50, proxy, shouldStop, onProgress, onLog }) {
    if (!this.browser) await this.init();

    const log = onLog || (() => {});
    const cookies = await this.loadSession();
    if (!cookies) {
      log("No Instagram session found. Run manual login first.");
      throw new Error("Instagram login required. Run the manual login flow first via /instagram/login endpoint.");
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
      // Use Instagram search
      log(`Searching Instagram for: ${keyword}`);
      await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(3000);

      // Click search and type keyword
      try {
        const searchBtn = page.locator('a[href*="search"], svg[aria-label="Search"]').first();
        await searchBtn.click({ timeout: 5000 });
        await page.waitForTimeout(1000);

        const searchInput = page.locator('input[placeholder*="Search"], input[aria-label*="Search"]').first();
        await searchInput.fill(keyword);
        await page.waitForTimeout(2000);
      } catch {
        // Try direct search URL
        await page.goto(`https://www.instagram.com/explore/tags/${encodeURIComponent(keyword)}/`, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });
        await page.waitForTimeout(3000);
      }

      // Collect profile usernames from search results or tag page
      let profileUrls = new Set();

      // From search dropdown results
      const searchLinks = await page.$$eval('a[href*="/"]', (anchors) => {
        return anchors
          .map((a) => a.href)
          .filter((href) => {
            const match = href.match(/instagram\.com\/([a-zA-Z0-9._]+)\/?$/);
            return match && !["explore", "accounts", "p", "reel", "stories", "direct"].includes(match[1]);
          });
      });

      for (const url of searchLinks) profileUrls.add(url.replace(/\/$/, "") + "/");

      // If we're on a tag page, collect profiles from posts
      if (profileUrls.size < targetCount) {
        const postLinks = await page.$$eval('a[href*="/p/"]', (anchors) =>
          [...new Set(anchors.map((a) => a.href))].slice(0, 50)
        );

        for (const postUrl of postLinks) {
          if (profileUrls.size >= targetCount * 3) break;
          if (shouldStop && await shouldStop()) break;

          try {
            await page.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
            await page.waitForTimeout(1500);

            const authorUrl = await page.$eval('a[href*="/"][role="link"] header a', (a) => a.href).catch(() => null);
            if (authorUrl) profileUrls.add(authorUrl.replace(/\/$/, "") + "/");
          } catch { /* skip */ }

          await page.waitForTimeout(2000 + Math.random() * 2000);
        }
      }

      log(`Found ${profileUrls.size} profiles for "${keyword}"`);

      // Visit each profile to extract email from bio
      for (const profileUrl of profileUrls) {
        if (shouldStop && await shouldStop()) break;
        if (results.length >= targetCount) break;

        try {
          await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
          await page.waitForTimeout(2000 + Math.random() * 3000);

          const profileData = await page.evaluate(() => {
            // Name
            const nameEl = document.querySelector("header h2, header span");
            const name = nameEl?.textContent?.trim() || "";

            // Full name
            const fullNameEl = document.querySelector("header section span[dir='auto']");
            const fullName = fullNameEl?.textContent?.trim() || name;

            // Bio
            const bioEl = document.querySelector("header + div span, div[class*='bio'] span, header section > div span");
            const bio = bioEl?.textContent || "";

            // Followers (look for text like "1.2M followers")
            const statsEls = document.querySelectorAll("header section ul li, header section a span");
            let followers = "";
            for (const el of statsEls) {
              const text = el.textContent || "";
              if (text.toLowerCase().includes("follower")) {
                followers = text;
                break;
              }
            }

            // External link
            const extLinkEl = document.querySelector('a[href*="l.instagram.com"], header section a[rel*="nofollow"]');
            const extLink = extLinkEl?.href || "";

            return { name, fullName, bio: bio + " " + extLink, followers };
          });

          const followers = parseFollowerCount(profileData.followers);
          if (followers < minSubs) continue;

          const email = extractEmail(profileData.bio);
          if (!email) continue;

          const username = profileUrl.match(/instagram\.com\/([^/]+)/)?.[1] || profileUrl;

          results.push({
            channelId: username,
            keyword,
            title: profileData.fullName || profileData.name,
            subscribers: followers,
            views: 0,
            videos: 0,
            country: "",
            email,
            source: "instagram",
            platform: "instagram",
            profileUrl,
            bio: profileData.bio.substring(0, 500),
          });

          log(`Found email for: ${profileData.fullName || username} (${followers.toLocaleString()} followers)`);
          if (onProgress) onProgress(results.length);
        } catch (err) {
          // Skip on error
        }

        // Rate limiting: 5-10 second delay
        await page.waitForTimeout(5000 + Math.random() * 5000);
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
