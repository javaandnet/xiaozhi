import BaseService from './base.js';

/**
 * MCP工具定义
 */
class ToolDefinition {
  constructor(name, description, toolType) {
    this.name = name;
    this.description = description;
    this.toolType = toolType;
  }
}

/**
 * 工具执行器基类
 */
class ToolExecutor {
  async execute(connection, toolName, args) {
    throw new Error('execute method must be implemented');
  }

  getTools() {
    return {};
  }

  hasTool(toolName) {
    return false;
  }
}

/**
 * 工具类型枚举
 */
const ToolType = {
  SERVER_PLUGIN: 'server_plugin',
  SERVER_MCP: 'server_mcp',
  DEVICE_IOT: 'device_iot',
  DEVICE_MCP: 'device_mcp',
  MCP_ENDPOINT: 'mcp_endpoint'
};

/**
 * 动作类型
 */
const Action = {
  NONE: 'NONE',
  RESPONSE: 'RESPONSE',
  REQLLM: 'REQLLM',
  ERROR: 'ERROR',
  NOTFOUND: 'NOTFOUND'
};

/**
 * 动作响应
 */
class ActionResponse {
  constructor(action, response = '', result = null, content = null) {
    this.action = action;
    this.response = response;
    this.result = result;
    this.content = content;
  }
}

/**
 * 设备端MCP客户端
 */
class DeviceMCPClient {
  constructor() {
    this.tools = new Map(); // sanitized_name -> tool_data
    this.nameMapping = new Map();
    this.ready = false;
    this.callResults = new Map(); // id -> Promise
    this.nextId = 1;
    this.lock = false;
  }

  hasTool(name) {
    return this.tools.has(name);
  }

  getAvailableTools() {
    const result = [];
    for (const [toolName, toolData] of this.tools) {
      const functionDef = {
        name: toolName,
        description: toolData.description,
        parameters: {
          type: toolData.inputSchema?.type || 'object',
          properties: toolData.inputSchema?.properties || {},
          required: toolData.inputSchema?.required || []
        }
      };
      result.push({ type: 'function', function: functionDef });
    }
    return result;
  }

  isReady() {
    return this.ready;
  }

  setReady(status) {
    this.ready = status;
  }

  async addTool(toolData) {
    const sanitizedName = this.sanitizeToolName(toolData.name);
    this.tools.set(sanitizedName, toolData);
    this.nameMapping.set(sanitizedName, toolData.name);
  }

  sanitizeToolName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  getNextId() {
    return this.nextId++;
  }

  registerCallResultFuture(id, promise) {
    this.callResults.set(id, promise);
  }

  resolveCallResult(id, result) {
    const promise = this.callResults.get(id);
    if (promise) {
      this.callResults.delete(id);
      promise.resolve(result);
    }
  }

  rejectCallResult(id, error) {
    const promise = this.callResults.get(id);
    if (promise) {
      this.callResults.delete(id);
      promise.reject(error);
    }
  }

  cleanupCallResult(id) {
    this.callResults.delete(id);
  }
}

/**
 * MCP服务类
 */
class McpService extends BaseService {
  constructor(config = {}) {
    super('MCP', config);
    this.deviceClients = new Map(); // clientId -> DeviceMCPClient
    this.executors = new Map();
    this.toolCache = null;
    this.functionDescriptionsCache = null;

    // 注册执行器
    this.registerExecutor(ToolType.DEVICE_MCP, new DeviceMCPExecutor(this));
    this.registerExecutor(ToolType.MCP_ENDPOINT, new MCPEndpointExecutor(this));

    console.log('✅ MCP服务构造完成');
  }

  async _initialize() {
    console.log('✅ MCP服务初始化完成');
  }

  async _healthCheck() {
    return {
      message: 'MCP服务运行正常',
      deviceClients: this.deviceClients.size,
      executors: this.executors.size
    };
  }

  /**
   * 注册工具执行器
   */
  registerExecutor(toolType, executor) {
    this.executors.set(toolType, executor);
    this.invalidateCache();
    console.log(`✅ 注册工具执行器: ${toolType}`);
  }

  /**
   * 使缓存失效
   */
  invalidateCache() {
    this.toolCache = null;
    this.functionDescriptionsCache = null;
  }

  /**
   * 获取所有工具定义
   */
  getAllTools() {
    if (this.toolCache) {
      return this.toolCache;
    }

    const allTools = new Map();
    for (const [toolType, executor] of this.executors) {
      try {
        const tools = executor.getTools();
        for (const [name, definition] of Object.entries(tools)) {
          if (allTools.has(name)) {
            console.warn(`⚠️ 工具名称冲突: ${name}`);
          }
          allTools.set(name, definition);
        }
      } catch (error) {
        console.error(`❌ 获取${toolType}工具时出错:`, error);
      }
    }

    this.toolCache = Object.fromEntries(allTools);
    return this.toolCache;
  }

  /**
   * 获取所有工具的函数描述（OpenAI格式）
   */
  getFunctionDescriptions() {
    if (this.functionDescriptionsCache) {
      return this.functionDescriptionsCache;
    }

    const descriptions = [];
    const tools = this.getAllTools();
    for (const toolDefinition of Object.values(tools)) {
      descriptions.push(toolDefinition.description);
    }

    this.functionDescriptionsCache = descriptions;
    return descriptions;
  }

  /**
   * 检查是否存在指定工具
   */
  hasTool(toolName) {
    const tools = this.getAllTools();
    return toolName in tools;
  }

  /**
   * 获取工具类型
   */
  getToolType(toolName) {
    const tools = this.getAllTools();
    const toolDef = tools[toolName];
    return toolDef ? toolDef.toolType : null;
  }

  /**
   * 执行工具调用
   */
  async executeTool(connection, toolName, args) {
    try {
      // 查找工具类型
      const toolType = this.getToolType(toolName);
      if (!toolType) {
        return new ActionResponse(
          Action.NOTFOUND,
          `工具 ${toolName} 不存在`
        );
      }

      // 获取对应的执行器
      const executor = this.executors.get(toolType);
      if (!executor) {
        return new ActionResponse(
          Action.ERROR,
          `工具类型 ${toolType} 的执行器未注册`
        );
      }

      // 执行工具
      console.log(`🔧 执行工具: ${toolName}，参数:`, arguments);
      const result = await executor.execute(connection, toolName, args);
      console.log(`✅ 工具执行结果:`, result);
      return result;

    } catch (error) {
      console.error(`❌ 执行工具 ${toolName} 时出错:`, error);
      return new ActionResponse(Action.ERROR, error.message);
    }
  }

  /**
   * 获取所有支持的工具名称
   */
  getSupportedToolNames() {
    const tools = this.getAllTools();
    return Object.keys(tools);
  }

  /**
   * 刷新工具缓存
   */
  refreshTools() {
    this.invalidateCache();
    console.log('🔄 工具缓存已刷新');
  }

  /**
   * 获取工具统计信息
   */
  getToolStatistics() {
    const stats = {};
    for (const [toolType, executor] of this.executors) {
      try {
        const tools = executor.getTools();
        stats[toolType] = Object.keys(tools).length;
      } catch (error) {
        console.error(`❌ 获取${toolType}工具统计时出错:`, error);
        stats[toolType] = 0;
      }
    }
    return stats;
  }

  /**
   * 处理MCP消息
   */
  async handleMcpMessage(connection, rtn) {
    let payload = rtn.payload;
    if (!payload || typeof payload !== 'object') {
      console.error('❌ MCP消息格式错误');
      return;
    }

    const clientId = connection.clientId;

    // 确保设备有MCP客户端
    if (!this.deviceClients.has(clientId)) {
      this.deviceClients.set(clientId, new DeviceMCPClient());
    }

    const mcpClient = this.deviceClients.get(clientId);

    // 处理结果
    if ('result' in payload) {
      const result = payload.result;
      const msgId = parseInt(payload.id || 0);

      // 检查工具调用响应
      if (mcpClient.callResults.has(msgId)) {
        console.log(`✅ 收到工具调用响应，ID: ${msgId}`);
        mcpClient.resolveCallResult(msgId, result);
        return;
      }

      if (msgId === 1) { // 初始化响应
        console.log('✅ 收到MCP初始化响应');
        const serverInfo = result?.serverInfo;
        if (serverInfo && typeof serverInfo === 'object') {
          console.log(`🖥️ 客户端MCP服务器信息: name=${serverInfo.name}, version=${serverInfo.version}`);
        }

        // 请求工具列表
        setTimeout(() => {
          this.sendMcpToolsListRequest(connection);
        }, 1000);

      } else if (msgId === 2) { // 工具列表响应
        // console.log('✅ 收到MCP工具列表响应');
        if (result && typeof result === 'object' && Array.isArray(result.tools)) {
          const toolsData = result.tools;
          // console.log(`📊 客户端设备支持的工具数量: ${toolsData.length}`);

          for (let i = 0; i < toolsData.length; i++) {
            const tool = toolsData[i];
            if (typeof tool === 'object') {
              const name = tool.name || '';
              const description = tool.description || '';
              const inputSchema = {
                type: 'object',
                properties: tool.inputSchema?.properties || {},
                required: Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : []
              };

              const newTool = {
                name: name,
                description: description,
                inputSchema: inputSchema
              };

              await mcpClient.addTool(newTool);
              console.log(`🔧 客户端工具 #${i + 1}: ${name}`);
            }
          }

          const nextCursor = result.nextCursor;
          if (nextCursor) {
            console.log(`⏭️ 有更多工具，nextCursor: ${nextCursor}`);
            this.sendMcpToolsListContinueRequest(connection, nextCursor);
          } else {
            mcpClient.setReady(true);
            console.log('✅ 所有工具已获取，MCP客户端准备就绪');

            // 刷新工具缓存
            this.refreshTools();
            console.log('📋 当前支持的工具:', this.getSupportedToolNames());
          }
        }
      }
    } else if (msgId === 3) { // 工具列表响应
      // console.log('✅ 收到MCP工具列表响应');
      if (result && typeof result === 'object' && Array.isArray(result.content)) {
        const contentsData = result.content;
        // console.log(`📊 客户端设备支持的工具数量: ${toolsData.length}`);

        for (let i = 0; i < contentsData.length; i++) {
          const content = contentsData[i];
          if (typeof content === 'object') {
            console.log(`🔧 客户端工具 #${i + 1}: ${JSO.stringify(content)}`);
          }
        }

      }
    } else if ('method' in payload) {
      const method = payload.method;
      console.log(`📥 收到MCP客户端请求: ${method}`);

    } else if ('error' in payload) {
      const errorData = payload.error;
      const errorMsg = errorData?.message || '未知错误';
      console.error(`❌ 收到MCP错误响应: ${errorMsg}`);

      const msgId = parseInt(payload.id || 0);
      if (mcpClient.callResults.has(msgId)) {
        mcpClient.rejectCallResult(msgId, new Error(`MCP错误: ${errorMsg}`));
      }
    }
  }

  /**
   * 发送MCP消息
   */
  sendMcpMessage(connection, payload) {
    if (!connection.features?.mcp) {
      console.warn('⚠️ 客户端不支持MCP，无法发送MCP消息');
      return;
    }

    const message = JSON.stringify({
      type: 'mcp',
      payload: payload
    });

    try {
      connection.send(message);
      console.log('📤 成功发送MCP消息:', message.substring(0, 100) + '...');
    } catch (error) {
      console.error('❌ 发送MCP消息失败:', error);
    }
  }

  /**
   * 发送MCP初始化消息
   */
  sendMcpInitializeMessage(connection) {
    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {
          roots: { listChanged: true },
          sampling: {}
        },
        clientInfo: {
          name: 'XiaozhiClient',
          version: '1.0.0'
        }
      }
    };

    console.log('📤 发送MCP初始化消息');
    this.sendMcpMessage(connection, payload);
  }

  /**
   * 发送MCP工具列表请求
   */
  sendMcpToolsListRequest(connection) {
    const payload = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: { cursor: "" }  // ✅ 添加必需的params字段
    };

    console.log('📤 发送MCP工具列表请求');
    this.sendMcpMessage(connection, payload);
  }

  /**
   * 发送带有cursor的MCP工具列表请求
   */
  sendMcpToolsListContinueRequest(connection, cursor) {
    const payload = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: { cursor: cursor }
    };

    console.log(`📤 发送带cursor的MCP工具列表请求: ${cursor}`);
    this.sendMcpMessage(connection, payload);
  }

  /**
   * 调用设备端MCP工具
   */
  async callDeviceMcpTool(connection, toolName, args = {}, timeout = 30) {
    const clientId = connection.clientId;
    const mcpClient = this.deviceClients.get(clientId);

    if (!mcpClient) {
      throw new Error('设备端MCP客户端未初始化');
    }

    if (!mcpClient.isReady()) {
      throw new Error('设备端MCP客户端未准备就绪');
    }

    if (!mcpClient.hasTool(toolName)) {
      throw new Error(`工具 ${toolName} 不存在`);
    }

    const toolCallId = mcpClient.getNextId();

    // 创建Promise用于等待响应
    const promise = new Promise((resolve, reject) => {
      mcpClient.registerCallResultFuture(toolCallId, { resolve, reject });
    });

    // 处理参数
    let toolArgs = args;
    if (typeof args === 'string') {
      try {
        toolArgs = args.trim() ? JSON.parse(args) : {};
      } catch (error) {
        throw new Error(`参数JSON解析失败: ${error.message}`);
      }
    }

    const actualName = mcpClient.nameMapping.get(toolName) || toolName;
    const payload = {
      jsonrpc: '2.0',
      id: toolCallId,
      method: 'tools/call',
      params: {
        name: actualName,
        arguments: toolArgs
      }
    };

    console.log(`📤 发送客户端MCP工具调用请求: ${actualName}，参数:`, toolArgs);
    this.sendMcpMessage(connection, payload);

    try {
      // 等待响应或超时
      const rawResult = await Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('工具调用请求超时')), timeout * 1000)
        )
      ]);

      console.log(`✅ 客户端MCP工具调用 ${actualName} 成功，原始结果:`, rawResult);

      if (typeof rawResult === 'object' && rawResult !== null) {
        if (rawResult.isError === true) {
          const errorMsg = rawResult.error || '工具调用返回错误，但未提供具体错误信息';
          throw new Error(`工具调用错误: ${errorMsg}`);
        }

        const content = rawResult.content;
        if (Array.isArray(content) && content.length > 0) {
          if (typeof content[0] === 'object' && 'text' in content[0]) {
            return content[0].text;
          }
        }
      }

      // 如果结果不是预期的格式，将其转换为字符串
      return String(rawResult);

    } catch (error) {
      mcpClient.cleanupCallResult(toolCallId);
      throw error;
    }
  }

  /**
   * 处理设备断开连接
   */
  handleDeviceDisconnect(clientId) {
    if (this.deviceClients.has(clientId)) {
      this.deviceClients.delete(clientId);
      this.refreshTools();
      console.log(`🔌 设备 ${clientId} 断开连接，清理MCP客户端`);
    }
  }
}

/**
 * 设备端MCP工具执行器
 */
class DeviceMCPExecutor extends ToolExecutor {
  constructor(mcpService) {
    super();
    this.mcpService = mcpService;
  }

  async execute(connection, toolName, args) {
    try {
      // 调用设备端MCP工具
      const result = await this.mcpService.callDeviceMcpTool(connection, toolName, args);

      // 尝试解析JSON结果
      let resultJson = null;
      if (typeof result === 'string') {
        try {
          resultJson = JSON.parse(result);
        } catch (e) {
          // 解析失败，继续使用字符串结果
        }
      }

      // 视觉大模型不经过二次LLM处理
      if (resultJson && typeof resultJson === 'object' && 'action' in resultJson) {
        return new ActionResponse(
          Action[resultJson.action],
          resultJson.response || ''
        );
      }

      return new ActionResponse(Action.REQLLM, null, String(result));

    } catch (error) {
      if (error.message.includes('不存在')) {
        return new ActionResponse(Action.NOTFOUND, error.message);
      }
      return new ActionResponse(Action.ERROR, error.message);
    }
  }

  getTools() {
    const tools = {};

    // 收集所有设备的MCP工具
    for (const [clientId, mcpClient] of this.mcpService.deviceClients) {
      if (mcpClient.isReady()) {
        const mcpTools = mcpClient.getAvailableTools();
        for (const tool of mcpTools) {
          const funcDef = tool.function;
          const toolName = funcDef.name;

          if (toolName) {
            tools[toolName] = new ToolDefinition(
              toolName,
              tool,
              ToolType.DEVICE_MCP
            );
          }
        }
      }
    }

    return tools;
  }

  hasTool(toolName) {
    // 检查所有设备的MCP客户端
    for (const mcpClient of this.mcpService.deviceClients.values()) {
      if (mcpClient.hasTool(toolName)) {
        return true;
      }
    }
    return false;
  }
}

/**
 * MCP接入点执行器（简化版）
 */
class MCPEndpointExecutor extends ToolExecutor {
  constructor(mcpService) {
    super();
    this.mcpService = mcpService;
  }

  async execute(connection, toolName, args) {
    // TODO: 实现MCP接入点工具调用
    return new ActionResponse(
      Action.ERROR,
      'MCP接入点功能暂未实现'
    );
  }

  getTools() {
    // TODO: 实现MCP接入点工具获取
    return {};
  }

  hasTool(toolName) {
    return false;
  }
}

export default McpService;
export {
  Action,
  ActionResponse,
  DeviceMCPClient,
  DeviceMCPExecutor,
  MCPEndpointExecutor, ToolDefinition,
  ToolExecutor,
  ToolType
};
