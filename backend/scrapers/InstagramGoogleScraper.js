import { chromium } from "playwright";

const EMAIL_REGEX = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;

const IGNORE_EMAIL_DOMAINS = [
  "instagram.com", "facebook.com", "meta.com", "fbcdn.net",
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
 * InstagramGoogleScraper — Finds Instagram profiles with emails via Google Search.
 * No Instagram login required. Searches Google for public IG profiles with visible emails.
 */
export class InstagramGoogleScraper {
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
        `site:instagram.com "@gmail.com" ${keyword}`,
        `site:instagram.com "email" "contact" ${keyword} -/p/ -/reel/`,
        `site:instagram.com "@yahoo.com" OR "@hotmail.com" OR "@outlook.com" ${keyword}`,
        `site:instagram.com "business" "email" ${keyword} -/p/ -/reel/`,
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

          const urls = await this._extractInstagramUrls(page);
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
                const moreUrls = await this._extractInstagramUrls(page);
                for (const url of moreUrls) profileUrls.add(url);
              } else break;
            } catch { break; }
          }
        } catch (err) {
          log(`Google search error: ${err.message}`);
        }

        await page.waitForTimeout(5000 + Math.random() * 5000);
      }

      log(`Google found ${profileUrls.size} Instagram profile links for "${keyword}"`);

      // Visit each profile — Instagram public profiles show bio without login
      for (const profileUrl of profileUrls) {
        if (shouldStop && (await shouldStop())) break;
        if (results.length >= targetCount) break;

        try {
          await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
          await page.waitForTimeout(3000 + Math.random() * 2000);

          const profileData = await page.evaluate(() => {
            // Instagram public pages often have structured meta tags
            const metaDesc = document.querySelector('meta[name="description"]')?.content || "";
            const metaTitle = document.querySelector('meta[property="og:title"]')?.content || "";

            // Name from page
            const nameEl = document.querySelector("header h2, header h1, title");
            const name = nameEl?.textContent?.trim()?.replace(/ \(@.*/, "") || metaTitle.split("(")[0]?.trim() || "";

            // Bio — Instagram puts it in meta description or page body
            const bodyText = document.body?.innerText?.substring(0, 8000) || "";
            const bio = metaDesc + " " + bodyText;

            // Extract follower count from meta description (format: "1.2M Followers")
            let followers = "";
            const followMatch = metaDesc.match(/([\d,.]+[KkMmBb]?)\s*Followers/i);
            if (followMatch) followers = followMatch[0];

            return { name, bio, followers };
          });

          const email = extractEmail(profileData.bio);
          if (!email) continue;

          const followers = parseFollowerCount(profileData.followers);
          if (followers < minSubs) continue;

          const username = profileUrl.match(/instagram\.com\/([^/?#]+)/)?.[1] || profileUrl;

          results.push({
            channelId: username,
            keyword,
            title: profileData.name || username,
            subscribers: followers,
            views: 0,
            videos: 0,
            country: "",
            email,
            source: "instagram-google",
            platform: "instagram",
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

  async _extractInstagramUrls(page) {
    return await page.$$eval("a[href*='instagram.com']", (anchors) => {
      const seen = new Set();
      const excluded = ["explore", "accounts", "p", "reel", "reels", "stories", "direct", "tags", "locations"];
      return anchors
        .map((a) => a.href)
        .filter((href) => {
          const match = href.match(/instagram\.com\/([a-zA-Z0-9._]+)\/?(\?|$)/);
          if (!match || seen.has(match[1])) return false;
          if (excluded.includes(match[1])) return false;
          seen.add(match[1]);
          return true;
        })
        .map((href) => {
          const match = href.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
          return `https://www.instagram.com/${match[1]}/`;
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
