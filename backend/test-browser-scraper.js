import { chromium } from "playwright";

const EMAIL_REGEX = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "en-US",
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  // Step 1: Search for channels
  console.log("=== Step 1: Search page ===");
  await page.goto("https://www.youtube.com/results?search_query=tech&sp=EgIQAg%3D%3D", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(3000);

  // Dismiss consent
  try {
    const btn = page.locator('button:has-text("Accept all"), button:has-text("Reject all")');
    if (await btn.first().isVisible({ timeout: 2000 })) {
      await btn.first().click();
      await page.waitForTimeout(1000);
    }
  } catch {}

  const pageTitle = await page.title();
  console.log("Page title:", pageTitle);

  // Collect channel links
  const links = await page.evaluate(() => {
    const anchors = document.querySelectorAll('a[href*="/@"], a[href*="/channel/"]');
    const seen = new Set();
    const results = [];
    for (const a of anchors) {
      const match = a.href.match(/youtube\.com\/((@[^/]+)|(channel\/[^/]+))/);
      if (match && !seen.has(match[1])) {
        seen.add(match[1]);
        results.push("https://www.youtube.com/" + match[1]);
      }
    }
    return results;
  });

  console.log("Channel links found:", links.length);
  links.slice(0, 5).forEach((l) => console.log("  ", l));

  if (links.length === 0) {
    // Dump page content for debugging
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 2000));
    console.log("\nPage content:\n", bodyText);
    await browser.close();
    process.exit(1);
  }

  // Step 2: Visit a channel - try the about page
  const testChannel = links[0];
  console.log("\n=== Step 2: Visit channel ===");
  console.log("Channel URL:", testChannel);

  const aboutUrl = testChannel.replace(/\/$/, "") + "/about";
  console.log("Trying /about URL:", aboutUrl);
  await page.goto(aboutUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(3000);

  const finalUrl = page.url();
  console.log("Final URL after navigation:", finalUrl);

  // Extract all possible data
  const channelData = await page.evaluate(() => {
    const getText = (sel) => document.querySelector(sel)?.textContent?.trim() || null;
    const getAll = (sel) =>
      Array.from(document.querySelectorAll(sel))
        .map((el) => el.textContent?.trim())
        .filter(Boolean);

    return {
      url: window.location.href,
      title: getText("ytd-channel-name #text") || getText("#channel-name") || getText("yt-dynamic-text-view-model .yt-core-attributed-string") || getText("h1"),
      subsText: getText("#subscriber-count") || getText("yt-formatted-string#subscriber-count"),
      allMetaSpans: getAll("yt-content-metadata-view-model span").slice(0, 10),
      descriptionContainer: getText("#description-container"),
      description: getText("#description"),
      aboutDescription: getText("ytd-channel-about-metadata-renderer #description"),
      aboutSection: getText("about-channel-renderer"),
      attributedStrings: getAll("yt-attributed-string span").slice(0, 5),
      linksSection: getAll("#link-list-container a, ytd-channel-about-metadata-renderer a").map((t) => t).slice(0, 10),
      bodySnippet: document.body?.innerText?.substring(0, 3000),
    };
  });

  console.log("\n=== Channel Data ===");
  console.log("Title:", channelData.title);
  console.log("Subs:", channelData.subsText);
  console.log("Meta spans:", channelData.allMetaSpans);
  console.log("Description (#description-container):", channelData.descriptionContainer?.substring(0, 200));
  console.log("Description (#description):", channelData.description?.substring(0, 200));
  console.log("About description:", channelData.aboutDescription?.substring(0, 200));
  console.log("About section:", channelData.aboutSection?.substring(0, 200));
  console.log("Attributed strings:", channelData.attributedStrings);
  console.log("Links section:", channelData.linksSection);

  // Check for emails in all text
  const allText = [
    channelData.descriptionContainer,
    channelData.description,
    channelData.aboutDescription,
    channelData.aboutSection,
    channelData.bodySnippet,
  ]
    .filter(Boolean)
    .join(" ");

  const emails = allText.match(EMAIL_REGEX);
  console.log("\nEmails found in page:", emails || "NONE");

  console.log("\n=== Page body (first 1500 chars) ===");
  console.log(channelData.bodySnippet?.substring(0, 1500));

  await browser.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
