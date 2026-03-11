import { chromium } from "playwright";

const EMAIL_REGEX = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;

const IGNORE_EMAIL_DOMAINS = [
  "youtube.com", "google.com", "googleapis.com", "gstatic.com",
  "ytimg.com", "ggpht.com", "example.com", "sentry.io",
  "w3.org", "schema.org", "wix.com", "squarespace.com",
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

function parseSubCount(text) {
  if (!text) return 0;
  const clean = text.toLowerCase().replace(/subscribers?/i, "").trim();
  const match = clean.match(/([\d.]+)\s*(k|m|b)?/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const suffix = (match[2] || "").toLowerCase();
  if (suffix === "b") return Math.round(num * 1_000_000_000);
  if (suffix === "m") return Math.round(num * 1_000_000);
  if (suffix === "k") return Math.round(num * 1_000);
  return Math.round(num);
}

/**
 * YouTubeGoogleScraper — Finds YouTube channels with emails via Google Search.
 * Zero YouTube API quota cost. Searches for channels that have emails in their descriptions.
 * Higher email hit rate (~50%) since Google pre-filters for email-containing pages.
 */
export class YouTubeGoogleScraper {
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
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "en-US",
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    const results = [];

    try {
      // Google search queries targeting YouTube channels with visible emails
      const queries = [
        `site:youtube.com "@gmail.com" ${keyword}`,
        `site:youtube.com "business inquiries" ${keyword}`,
        `site:youtube.com "contact" "email" ${keyword}`,
        `site:youtube.com/@ ${keyword} email`,
      ];

      let channelUrls = new Set();

      for (const query of queries) {
        if (shouldStop && (await shouldStop())) break;
        if (channelUrls.size >= targetCount * 3) break;

        log(`Google search: "${query}"`);

        try {
          await page.goto(
            `https://www.google.com/search?q=${encodeURIComponent(query)}&num=50`,
            { waitUntil: "domcontentloaded", timeout: 30000 }
          );
          await page.waitForTimeout(2000 + Math.random() * 2000);

          // Dismiss Google consent if present
          try {
            const consentBtn = page.locator('button:has-text("Accept all"), button:has-text("I agree")');
            if (await consentBtn.first().isVisible({ timeout: 2000 })) {
              await consentBtn.first().click();
              await page.waitForTimeout(1000);
            }
          } catch { /* no consent */ }

          // Extract YouTube channel URLs from Google results
          const urls = await this._extractYouTubeUrls(page);
          for (const url of urls) channelUrls.add(url);

          // Try to go to next Google page (up to 3 more pages)
          for (let gPage = 0; gPage < 3; gPage++) {
            if (shouldStop && (await shouldStop())) break;
            if (channelUrls.size >= targetCount * 3) break;

            try {
              const nextBtn = page.locator('#pnnext, a[aria-label="Next page"]');
              if (await nextBtn.first().isVisible({ timeout: 2000 })) {
                await nextBtn.first().click();
                await page.waitForTimeout(3000 + Math.random() * 3000);
                const moreUrls = await this._extractYouTubeUrls(page);
                for (const url of moreUrls) channelUrls.add(url);
              } else {
                break;
              }
            } catch {
              break;
            }
          }
        } catch (err) {
          log(`Google search error: ${err.message}`);
        }

        // Rate limit between different Google queries (avoid getting blocked)
        await page.waitForTimeout(5000 + Math.random() * 5000);
      }

      log(`Google found ${channelUrls.size} YouTube channel links for "${keyword}"`);

      // Visit each channel to verify email and get subscriber count
      for (const channelUrl of channelUrls) {
        if (shouldStop && (await shouldStop())) break;
        if (results.length >= targetCount) break;

        try {
          const aboutUrl = channelUrl.replace(/\/$/, "") + "/about";
          await page.goto(aboutUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
          await page.waitForTimeout(3000 + Math.random() * 2000);

          // Dismiss YouTube consent if present
          try {
            const consentBtn = page.locator('button:has-text("Accept all"), button:has-text("Reject all")');
            if (await consentBtn.first().isVisible({ timeout: 2000 })) {
              await consentBtn.first().click();
              await page.waitForTimeout(1000);
            }
          } catch { /* no consent */ }

          const channelData = await page.evaluate(() => {
            // Title
            const title =
              document.querySelector("ytd-channel-name #text")?.textContent?.trim() ||
              document.querySelector("#channel-name")?.textContent?.trim() ||
              document.querySelector("yt-dynamic-text-view-model .yt-core-attributed-string")?.textContent?.trim() ||
              document.querySelector("h1")?.textContent?.trim() ||
              "";

            // Subscriber count from meta spans
            let subsText = "";
            const metaSpans = document.querySelectorAll("yt-content-metadata-view-model span");
            for (const span of metaSpans) {
              const t = span.textContent?.trim() || "";
              if (/subscribers?/i.test(t)) {
                subsText = t;
                break;
              }
            }
            if (!subsText) {
              subsText =
                document.querySelector("#subscriber-count")?.textContent?.trim() ||
                document.querySelector("yt-formatted-string#subscriber-count")?.textContent?.trim() ||
                "";
            }

            // Description — gather from all sources
            const descParts = [];
            const descContainer = document.querySelector("#description-container")?.textContent;
            if (descContainer) descParts.push(descContainer);
            const descEl = document.querySelector("#description")?.textContent;
            if (descEl) descParts.push(descEl);
            const aboutDesc = document.querySelector("ytd-channel-about-metadata-renderer #description")?.textContent;
            if (aboutDesc) descParts.push(aboutDesc);
            const attrStrings = document.querySelectorAll("yt-attributed-string span");
            const attrText = Array.from(attrStrings).map((s) => s.textContent).join(" ");
            if (attrText) descParts.push(attrText);
            const aboutSection = document.querySelector("about-channel-renderer")?.textContent;
            if (aboutSection) descParts.push(aboutSection);
            const linksEls = document.querySelectorAll(
              "ytd-channel-about-metadata-renderer a, #link-list-container a, a[href*='mailto:']"
            );
            const linksText = Array.from(linksEls)
              .map((a) => (a.textContent || "") + " " + (a.href || ""))
              .join(" ");
            if (linksText) descParts.push(linksText);
            const bodyText = document.body?.innerText?.substring(0, 5000) || "";
            descParts.push(bodyText);

            const description = descParts.join(" ");

            const canonicalEl = document.querySelector('link[rel="canonical"]');
            const canonical = canonicalEl?.href || window.location.href;

            let country = "";
            const detailsEl = document.querySelector('#details-container yt-formatted-string:last-child, [id*="country"]');
            if (detailsEl) country = detailsEl.textContent?.trim() || "";

            return { title, subsText, description, canonical, country };
          });

          const subs = parseSubCount(channelData.subsText);
          if (subs < minSubs) continue;

          const email = extractEmail(channelData.description);
          if (!email) continue;

          // Extract channelId
          let channelId = "";
          const idMatch = channelData.canonical.match(/channel\/(UC[a-zA-Z0-9_-]+)/);
          if (idMatch) {
            channelId = idMatch[1];
          } else {
            const handleMatch = channelData.canonical.match(/@([a-zA-Z0-9._-]+)/);
            channelId = handleMatch ? `@${handleMatch[1]}` : channelUrl;
          }

          results.push({
            channelId,
            keyword,
            title: channelData.title,
            subscribers: subs,
            views: 0,
            videos: 0,
            country: channelData.country,
            email,
            source: "youtube-google",
            platform: "youtube",
            profileUrl: channelUrl,
          });

          log(`Found via Google: ${channelData.title} (${subs.toLocaleString()} subs)`);
          if (onProgress) onProgress(results.length);
        } catch (err) {
          // Skip this channel on error
        }

        // Rate limiting between channel visits
        await page.waitForTimeout(2000 + Math.random() * 3000);
      }
    } finally {
      await context.close();
    }

    return results;
  }

  /**
   * Extract YouTube channel URLs from Google search results page.
   */
  async _extractYouTubeUrls(page) {
    return await page.$$eval("a[href*='youtube.com']", (anchors) => {
      const seen = new Set();
      return anchors
        .map((a) => a.href)
        .filter((href) => {
          // Match channel URLs: youtube.com/@handle or youtube.com/channel/UCxxx
          const match = href.match(/youtube\.com\/((@[^/\s?#]+)|(channel\/[^/\s?#]+))/);
          if (!match || seen.has(match[1])) return false;
          seen.add(match[1]);
          return true;
        })
        .map((href) => {
          const match = href.match(/youtube\.com\/((@[^/\s?#]+)|(channel\/[^/\s?#]+))/);
          return `https://www.youtube.com/${match[1]}`;
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
