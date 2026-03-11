import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import { scraperQueue } from "./queue/scraperQueue.js";
import Channel from "./models/Channel.js";
import cors from "cors";


dotenv.config();
await connectDB();



const app = express();
app.use(express.json());

app.use(cors());

const KEYWORDS = ["football", "finance"];
const COUNTRY = "IN";

/* 🚀 ADD JOBS IMMEDIATELY ON START */
async function startScraping() {
  for (const keyword of KEYWORDS) {
    await scraperQueue.add(
      "scrape",
      { keyword, country: COUNTRY },
      {
        removeOnComplete: true,
        removeOnFail: true,
        repeat: {
          every: 1000 * 60 * 30, // every 30 mins
        },
      }
    );
  }

  console.log("🔥 Scraping Jobs Scheduled");
}

await startScraping();

/* Manual Trigger */
app.post("/scrape", async (req, res) => {
  const { keyword, country } = req.body;

  await scraperQueue.add("scrape", {
    keyword,
    country,
  });

  res.json({ message: "Job Added" });
});

/* Get Channels */
app.get("/channels", async (req, res) => {
  const data = await Channel.find().sort({
    subscribers: -1,
  });
  res.json(data);
});

app.listen(process.env.PORT, () =>
  console.log("🚀 Server Running")
);