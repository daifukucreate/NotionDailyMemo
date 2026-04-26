import express from "express";
import dotenv from "dotenv";
import { Client } from "@notionhq/client";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// publicフォルダを静的ファイルとして公開
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

const databaseId = process.env.NOTION_DATABASE_ID;

function getTodayJSTText() {
  return getJSTDateText(new Date());
}

function getJSTDateText(date) {
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year").value;
  const month = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;

  return `${year}-${month}-${day}`;
}

function getJSTRangeISOByDateText(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);

  // JST 00:00 は UTC で前日の15:00
  const startJST = new Date(Date.UTC(year, month - 1, day, -9, 0, 0));
  const endJST = new Date(Date.UTC(year, month - 1, day + 1, -9, 0, 0));

  return {
    start: startJST.toISOString(),
    end: endJST.toISOString(),
  };
}

async function findPageByJSTDate(dateText) {
  const { start, end } = getJSTRangeISOByDateText(dateText);

  const result = await notion.databases.query({
    database_id: databaseId,
    filter: {
      and: [
        {
          timestamp: "created_time",
          created_time: {
            on_or_after: start,
          },
        },
        {
          timestamp: "created_time",
          created_time: {
            before: end,
          },
        },
      ],
    },
    sorts: [
      {
        timestamp: "created_time",
        direction: "descending",
      },
    ],
    page_size: 1,
  });

  if (result.results.length === 0) {
    return null;
  }

  return result.results[0];
}

// ブラウザ側から今日の日付を取得するAPI
app.get("/api/today", (req, res) => {
  res.json({
    today: getTodayJSTText(),
  });
});

// 指定日のNotionカードにWidget内容を書き込む
app.post("/save-to-date", async (req, res) => {
  try {
    const { targetDate, title, items } = req.body;

    const safeTargetDate = targetDate || getTodayJSTText();
    const safeTitle = title && title.trim() !== "" ? title.trim() : "無題";

    const safeItems = Array.isArray(items)
      ? items.map((item) => String(item).trim()).filter((item) => item !== "")
      : [];

    const targetPage = await findPageByJSTDate(safeTargetDate);

    if (!targetPage) {
      return res.status(404).json({
        ok: false,
        message:
          safeTargetDate +
          " の新しいギャラリーカードがまだ見つかりません。Notion側でカードが作成されるまで待ちます。",
      });
    }

    const pageId = targetPage.id;

    const children = [
      {
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [
            {
              type: "text",
              text: {
                content: safeTitle,
              },
            },
          ],
        },
      },
    ];

    for (const item of safeItems) {
      children.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [
            {
              type: "text",
              text: {
                content: item,
              },
            },
          ],
        },
      });
    }

    await notion.blocks.children.append({
      block_id: pageId,
      children,
    });

    res.json({
      ok: true,
      message: safeTargetDate + " の新しいNotionカードに保存しました",
      pageId,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: error.message,
    });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on http://localhost:${process.env.PORT || 3000}`);
});