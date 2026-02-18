# 可实装企业级 AI Agent + RAGFlow 技术实现说明书

本说明书提供一套可直接落地的 NodeJS + LangGraph + RAGFlow
本地部署实现方案， 包含：

1.  RAGFlow 部署与文档导入
2.  RAGFlow API 调用方式
3.  LangGraph Node 设计
4.  完整 Graph 结构
5.  生产级优化建议

  --------------------------------------------------------------------------------------------------------------
  \# 一、整体系统架构
  --------------------------------------------------------------------------------------------------------------
  \# 二、RAGFlow 本地部署

  \## 2.1 Docker 部署

  创建 docker-compose.yml

  `yaml version: "3" services: ragflow: image: infiniflow/ragflow:latest ports: - "9380:9380" restart: always`

  启动：

  `bash docker compose up -d`

  访问：

  http://localhost:9380
  --------------------------------------------------------------------------------------------------------------

# 三、RAGFlow 文档导入

## 3.1 Web UI 导入

1.  创建 Knowledge Base
2.  点击 Upload
3.  上传 PDF / DOCX / TXT / CSV / MD 等文件
4.  等待向量化完成

## 3.2 API 批量导入

接口示例：

POST /api/v1/datasets/{dataset_id}/documents

curl 示例：

``` bash
curl -X POST   http://localhost:9380/api/v1/datasets/xxx/documents   -H "Authorization: Bearer YOUR_API_KEY"   -F "file=@manual.pdf"
```

## 3.3 直接文本导入

``` json
{
  "name": "内部制度",
  "content": "这里是完整文本内容"
}
```

  --------------------------------------------
  \# 四、RAGFlow 搜索 API 调用
  --------------------------------------------
  \# 五、LangGraph Node 设计

  推荐节点结构：

  1\. classify_node 2. rag_search_node 3.
  answer_node
  --------------------------------------------

## 5.1 classify_node

职责：判断是否需要调用知识库

``` js
const classifyNode = async (state) => {
  const question = state.input

  const result = await llm.invoke(`
  判断以下问题是否需要查阅公司内部知识库：
  ${question}
  只回答 yes 或 no
  `)

  return {
    ...state,
    needSearch: result.toLowerCase().includes("yes")
  }
}
```

  ---------------------------------------------------------------
  \## 5.2 rag_search_node
  ---------------------------------------------------------------
  \## 5.3 answer_node

  职责：基于上下文生成回答

  \`\``js const answerNode = async (state) => { const prompt =`
  你是企业内部AI助手。

  问题： \${state.input}

  参考资料： \${state.context \|\| "无"}

  请基于资料回答，如果资料不足请说明。 \`

  const answer = await llm.invoke(prompt)

  return { ...state, answer } } \`\`\`
  ---------------------------------------------------------------

# 六、LangGraph 构建完整流程

``` js
import { StateGraph } from "@langchain/langgraph"

const workflow = new StateGraph({
  channels: {
    input: "string",
    needSearch: "boolean",
    context: "string",
    answer: "string"
  }
})

workflow.addNode("classify", classifyNode)
workflow.addNode("rag", ragSearchNode)
workflow.addNode("answer", answerNode)

workflow.addEdge("__start__", "classify")

workflow.addConditionalEdges("classify", (state) =>
  state.needSearch ? "rag" : "answer"
)

workflow.addEdge("rag", "answer")
workflow.addEdge("answer", "__end__")

export const app = workflow.compile()
```

  --------------------------------------------
  \# 七、生产级优化建议
  --------------------------------------------
  \# 八、企业部署建议

  推荐结构：

  Docker ├── RAGFlow ├── 向量数据库 ├── NodeJS
  Agent 服务 └── Nginx

  推荐内存：32GB CPU 部署即可
  --------------------------------------------

# 九、最终可扩展架构

Router Agent ↓ RAG Agent ↓ Tool Agent (SQL / Web / CRM) ↓ Memory Node

该架构适用于 100 人规模企业，并可横向扩展。
