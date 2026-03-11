import axios from "axios";
import Channel from "../models/Channel.js";

const MIN_SUBS = 50000;

function extractEmail(text) {
  if (!text) return null;
  const match = text.match(
    /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi
  );
  return match ? match[0] : null;
}

export const fetchChannels = async (keyword, country) => {
  const search = await axios.get(
    "https://www.googleapis.com/youtube/v3/search",
    {
      params: {
        key: process.env.YOUTUBE_API_KEY,
        q: keyword,
        type: "channel",
        part: "snippet",
        maxResults: 50,
        regionCode: country,
      },
    }
  );

  const ids = search.data.items.map(
    (i) => i.snippet.channelId
  );

  if (!ids.length) return;

  const details = await axios.get(
    "https://www.googleapis.com/youtube/v3/channels",
    {
      params: {
        key: process.env.YOUTUBE_API_KEY,
        id: ids.join(","),
        part: "snippet,statistics",
      },
    }
  );

  for (const ch of details.data.items) {
    const subs = parseInt(ch.statistics.subscriberCount || 0);
    if (subs < MIN_SUBS) continue;

    const email = extractEmail(ch.snippet.description);

    await Channel.updateOne(
      { channelId: ch.id },
      {
        $set: {
          channelId: ch.id,
          title: ch.snippet.title,
          description: ch.snippet.description,
          subscribers: subs,
          views: parseInt(ch.statistics.viewCount || 0),
          videos: parseInt(ch.statistics.videoCount || 0),
          country: ch.snippet.country,
          email,
        },
      },
      { upsert: true }
    );

    console.log("Saved:", ch.snippet.title);
  }
};