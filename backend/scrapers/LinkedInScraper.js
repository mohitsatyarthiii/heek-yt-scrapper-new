import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, "sessions", "linkedin-session.json");
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

export class LinkedInScraper {
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

  // Call this to open a visible browser for manual login
  async manualLogin() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    await page.goto("https://www.linkedin.com/login");

    console.log("Please log in to LinkedIn in the browser window...");
    console.log("Press Enter in this terminal once you are logged in.");

    // Wait for user input
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
      log("No LinkedIn session found. Run manual login first.");
      throw new Error("LinkedIn login required. Run the manual login flow first via /linkedin/login endpoint.");
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
      // Search for people
      const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keyword)}&origin=GLOBAL_SEARCH_HEADER`;
      log(`Searching LinkedIn for: ${keyword}`);
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(3000);

      // Check if we're logged in
      const isLoggedIn = await page.$('input[placeholder*="Search"]') !== null;
      if (!isLoggedIn) {
        await this.saveSession(context); // Save might help next time
        throw new Error("LinkedIn session expired. Please re-login.");
      }

      let profileUrls = new Set();
      let pageNum = 1;
      const maxPages = Math.min(10, Math.ceil(targetCount / 10));

      while (profileUrls.size < targetCount * 2 && pageNum <= maxPages) {
        if (shouldStop && await shouldStop()) break;

        // Collect profile links on current page
        const links = await page.$$eval(
          'a[href*="/in/"]',
          (anchors) => {
            const seen = new Set();
            return anchors
              .map((a) => a.href)
              .filter((href) => {
                const match = href.match(/linkedin\.com\/in\/([^/?]+)/);
                if (!match || seen.has(match[1])) return false;
                seen.add(match[1]);
                return true;
              })
              .map((href) => {
                const match = href.match(/linkedin\.com\/in\/([^/?]+)/);
                return `https://www.linkedin.com/in/${match[1]}/`;
              });
          }
        );

        for (const url of links) profileUrls.add(url);

        // Go to next page
        pageNum++;
        try {
          const nextBtn = page.locator('button[aria-label="Next"]');
          if (await nextBtn.isVisible({ timeout: 2000 })) {
            await nextBtn.click();
            await page.waitForTimeout(3000 + Math.random() * 3000);
          } else {
            break;
          }
        } catch {
          break;
        }
      }

      log(`Found ${profileUrls.size} profiles for "${keyword}"`);

      // Visit each profile
      for (const profileUrl of profileUrls) {
        if (shouldStop && await shouldStop()) break;
        if (results.length >= targetCount) break;

        try {
          await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
          await page.waitForTimeout(2000 + Math.random() * 3000);

          const profileData = await page.evaluate(() => {
            const nameEl = document.querySelector("h1");
            const name = nameEl?.textContent?.trim() || "";

            const titleEl = document.querySelector(".text-body-medium");
            const title = titleEl?.textContent?.trim() || "";

            const locationEl = document.querySelector(".text-body-small .inline-block");
            const location = locationEl?.textContent?.trim() || "";

            // Look for email in about/contact section
            const aboutEl = document.querySelector("#about ~ .display-flex .inline-show-more-text, [class*='about'] span");
            const about = aboutEl?.textContent || "";

            // Follower count
            const followersEl = document.querySelector('[class*="follower"]');
            const followers = followersEl?.textContent?.trim() || "";

            return { name, title, location, about, followers };
          });

          const followers = parseFollowerCount(profileData.followers);
          if (followers < minSubs) continue;

          const email = extractEmail(profileData.about);
          if (!email) continue;

          const slug = profileUrl.match(/\/in\/([^/]+)/)?.[1] || profileUrl;

          results.push({
            channelId: slug,
            keyword,
            title: profileData.name,
            subscribers: followers,
            views: 0,
            videos: 0,
            country: profileData.location,
            email,
            source: "linkedin",
            platform: "linkedin",
            profileUrl,
            bio: `${profileData.title} | ${profileData.about}`.substring(0, 500),
          });

          log(`Found email for: ${profileData.name} (${followers.toLocaleString()} followers)`);
          if (onProgress) onProgress(results.length);
        } catch (err) {
          // Skip on error
        }

        // Conservative rate limiting: 8-15 second delay
        await page.waitForTimeout(8000 + Math.random() * 7000);
      }

      // Save refreshed session
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
