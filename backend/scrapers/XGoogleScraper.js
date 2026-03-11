import { chromium } from "playwright";

const EMAIL_REGEX = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;

const IGNORE_EMAIL_DOMAINS = [
  "twitter.com", "x.com", "twimg.com",
  "google.com", "googleapis.com", "gstatic.com", "example.com",
  "sentry.io", "w3.org", "schema.org", "wix.com", "squarespace.com",
];

function extractEmail(text) {
  if (!text) return null;
  const matches = text.match(EMAIL_REGEX);
  if (!matches) return null;
  for (const email of matches) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (domain && !IGNORE_EMAIL_DOMAINS.some((d) => domain.endsWith(d))) {
      return email;
    }
  }
  return null;
}

function parseFollowerCount(text) {
  if (!text) return 0;
  const clean = text.toLowerCase().replace(/followers?/gi, "").trim();
  const match = clean.match(/([\d,.]+)\s*(k|m|b)?/i);
  if (!match) return 0;
  const num = parseFloat(match[1].replace(/,/g, ""));
  const suffix = (match[2] || "").toLowerCase();
  if (suffix === "b") return Math.round(num * 1_000_000_000);
  if (suffix === "m") return Math.round(num * 1_000_000);
  if (suffix === "k") return Math.round(num * 1_000);
  return Math.round(num);
}

/**
 * XGoogleScraper — Finds X/Twitter profiles with emails via Google Search.
 * No X login required. Searches Google for public X profiles with visible emails.
 */
export class XGoogleScraper {
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

  async scrape(keyword, { minSubs = 0, targetCount = 100, proxy, shouldStop, onProgress, onLog }) {
    if (!this.browser) await this.init();

    const log = onLog || (() => {});
    const context = await this.browser.newContext({
      ...(proxy ? { proxy } : {}),
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    const results = [];

    try {
      const queries = [
        `site:x.com "@gmail.com" ${keyword} -/status/`,
        `site:x.com "email" "contact" ${keyword} -/status/`,
        `site:x.com "@yahoo.com" OR "@hotmail.com" OR "@outlook.com" ${keyword} -/status/`,
        `site:twitter.com "@gmail.com" ${keyword} -/status/`,
        `site:twitter.com "email" "contact" ${keyword} -/status/`,
      ];

      let profileUrls = new Set();

      for (const query of queries) {
        if (shouldStop && (await shouldStop())) break;
        if (profileUrls.size >= targetCount * 3) break;

        log(`Google search: "${query}"`);

        try {
          await page.goto(
            `https://www.google.com/search?q=${encodeURIComponent(query)}&num=50`,
            { waitUntil: "domcontentloaded", timeout: 30000 }
          );
          await page.waitForTimeout(2000 + Math.random() * 2000);

          try {
            const consentBtn = page.locator('button:has-text("Accept all"), button:has-text("I agree")');
            if (await consentBtn.first().isVisible({ timeout: 2000 })) {
              await consentBtn.first().click();
              await page.waitForTimeout(1000);
            }
          } catch { /* no consent */ }

          const urls = await this._extractXUrls(page);
          for (const url of urls) profileUrls.add(url);

          // Next pages
          for (let gPage = 0; gPage < 3; gPage++) {
            if (shouldStop && (await shouldStop())) break;
            if (profileUrls.size >= targetCount * 3) break;
            try {
              const nextBtn = page.locator('#pnnext, a[aria-label="Next page"]');
              if (await nextBtn.first().isVisible({ timeout: 2000 })) {
                await nextBtn.first().click();
                await page.waitForTimeout(3000 + Math.random() * 3000);
                const moreUrls = await this._extractXUrls(page);
                for (const url of moreUrls) profileUrls.add(url);
              } else break;
            } catch { break; }
          }
        } catch (err) {
          log(`Google search error: ${err.message}`);
        }

        await page.waitForTimeout(5000 + Math.random() * 5000);
      }

      log(`Google found ${profileUrls.size} X/Twitter profile links for "${keyword}"`);

      // Visit each profile
      for (const profileUrl of profileUrls) {
        if (shouldStop && (await shouldStop())) break;
        if (results.length >= targetCount) break;

        try {
          await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
          await page.waitForTimeout(3000 + Math.random() * 2000);

          const profileData = await page.evaluate(() => {
            const metaDesc = document.querySelector('meta[name="description"]')?.content || "";
            const metaTitle = document.querySelector('meta[property="og:title"]')?.content || "";

            const name = metaTitle.split("(")[0]?.trim() || "";
            const bodyText = document.body?.innerText?.substring(0, 8000) || "";
            const bio = metaDesc + " " + bodyText;

            // Extract follower count from meta description (format: "1.2K Followers")
            let followers = "";
            const followMatch = metaDesc.match(/([\d,.]+[KkMmBb]?)\s*Followers/i);
            if (followMatch) followers = followMatch[0];

            return { name, bio, followers };
          });

          const email = extractEmail(profileData.bio);
          if (!email) continue;

          const followers = parseFollowerCount(profileData.followers);
          if (followers < minSubs) continue;

          // Extract username from x.com or twitter.com URL
          const username = profileUrl.match(/(?:x|twitter)\.com\/([^/?#]+)/)?.[1] || profileUrl;

          results.push({
            channelId: username,
            keyword,
            title: profileData.name || username,
            subscribers: followers,
            views: 0,
            videos: 0,
            country: "",
            email,
            source: "x-google",
            platform: "x",
            profileUrl,
          });

          log(`Found via Google: ${profileData.name || username} (${followers.toLocaleString()} followers)`);
          if (onProgress) onProgress(results.length);
        } catch {
          // Skip on error
        }

        await page.waitForTimeout(2000 + Math.random() * 3000);
      }
    } finally {
      await context.close();
    }

    return results;
  }

  async _extractXUrls(page) {
    return await page.$$eval("a[href*='x.com'], a[href*='twitter.com']", (anchors) => {
      const seen = new Set();
      const excluded = [
        "explore", "search", "settings", "i", "home", "notifications",
        "messages", "compose", "hashtag", "login", "signup", "tos", "privacy",
        "status", "intent",
      ];
      return anchors
        .map((a) => a.href)
        .filter((href) => {
          const match = href.match(/(?:x|twitter)\.com\/([a-zA-Z0-9_]+)\/?(\?|$)/);
          if (!match || seen.has(match[1].toLowerCase())) return false;
          if (excluded.includes(match[1].toLowerCase())) return false;
          // Skip status/tweet URLs
          if (href.includes("/status/")) return false;
          seen.add(match[1].toLowerCase());
          return true;
        })
        .map((href) => {
          const match = href.match(/(?:x|twitter)\.com\/([a-zA-Z0-9_]+)/);
          return `https://x.com/${match[1]}`;
        });
    });
  }

  async cleanup() {
    if (this.browser && this.ownsBrowser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
