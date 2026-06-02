import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "search_kb",
      {
        title: "Search Knowledge Base",
        description:
          "게임 프로젝트(GJD)의 기획서·결정 Ledger·상태 문서를 의미 검색한다. 성장 시스템, 매치 엔진, 결정 기록(Ledger), 기획 사양 등을 찾을 때 사용.",
        inputSchema: {
          query: z.string().describe("검색할 자연어 질의"),
          match_count: z
            .number()
            .int()
            .min(1)
            .max(10)
            .optional()
            .describe("반환할 청크 수 (기본 5)"),
        },
      },
      async ({ query, match_count }) => {
        const emb = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: query,
        });

        const { data, error } = await supabase.rpc("match_documents", {
          query_embedding: emb.data[0].embedding,
          match_count: match_count ?? 5,
        });

        if (error) {
          return {
            content: [{ type: "text", text: `검색 오류: ${error.message}` }],
          };
        }

        if (!data || data.length === 0) {
          return {
            content: [{ type: "text", text: "관련 청크를 찾지 못했습니다." }],
          };
        }

        const formatted = data
          .map(
            (d, i) =>
              `[${i + 1}] (유사도 ${d.similarity.toFixed(3)}) ${d.source_path}` +
              (d.tag_status ? ` [${d.tag_status}]` : "") +
              `\n섹션: ${d.metadata?.heading ?? "-"}\n${d.content}`
          )
          .join("\n\n---\n\n");

        return { content: [{ type: "text", text: formatted }] };
      }
    );
  },
  {},
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: true,
  }
);

export { handler as GET, handler as POST };
