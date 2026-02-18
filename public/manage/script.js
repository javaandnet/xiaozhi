// 设备类型配置（一元化管理）
const DEVICE_TYPES = [
    { value: 'agent', label: 'Agent', tag: 'success', canTakePhoto: false, canSendMessage: true },
    { value: 'manager', label: '管理者', tag: 'primary', canTakePhoto: false, canSendMessage: false },
    { value: 'hard', label: '小爱', tag: 'warning', canTakePhoto: true, canSendMessage: true }
];

// 创建Vue应用实例
const { createApp, ref, reactive, computed, onMounted } = Vue;

const app = createApp({
    setup() {
        // 响应式数据
        const ws = ref(null);
        const isConnected = ref(false);
        const isConnecting = ref(false);
        const clientId = ref(null);

        // 设备管理数据
        const devices = ref([]);
        const loading = ref(false);
        const searchKeyword = ref('');
        const filterStatus = ref('');
        const filterType = ref('');
        const currentPage = ref(1);
        const pageSize = ref(20);
        const selectedDevices = ref([]);

        // 设备详情抽屉
        const deviceDetailVisible = ref(false);
        const currentDevice = ref(null);

        // 发送信息对话框
        const sendMessageVisible = ref(false);
        const sendMessageForm = reactive({
            targetClientId: '',
            targetType: '',
            messageType: 'tts',
            content: '',
            isllm: true
        });

        // 折叠面板状态
        const activeCollapse = ref(['connection', 'logs']);

        // 系统日志
        const systemLogs = ref([
            { id: 1, time: new Date().toLocaleTimeString(), message: '系统初始化完成', type: 'info' }
        ]);

        // 过滤后的设备列表
        const filteredDevices = computed(() => {
            let result = [...devices.value];

            // 关键词搜索
            if (searchKeyword.value) {
                const keyword = searchKeyword.value.toLowerCase();
                result = result.filter(device =>
                    device.clientId?.toLowerCase().includes(keyword) ||
                    device.deviceId?.toLowerCase().includes(keyword) ||
                    device.ip?.toLowerCase().includes(keyword)
                );
            }

            // 状态筛选
            if (filterStatus.value) {
                result = result.filter(device => device.status === filterStatus.value);
            }

            // 类型筛选
            if (filterType.value) {
                result = result.filter(device => device.type === filterType.value);
            }

            return result;
        });

        // 服务器配置
        const serverConfig = reactive({
            httpServerUrl: localStorage.getItem('httpServerUrl') || 'http://localhost:8003',
            websocketUrl: null
        });

        // DOM元素引用
        const elements = {
            statusIndicator: ref(null),
            statusText: ref(null),
            connectBtn: ref(null),
            disconnectBtn: ref(null),
            reconnectBtn: ref(null),
            serverUrlInput: ref(null),
            saveServerBtn: ref(null),
            testBtn: ref(null)
        };

        // 方法定义
        const addSystemLog = (message, type = 'info') => {
            systemLogs.value.unshift({
                id: Date.now(),
                time: new Date().toLocaleTimeString(),
                message,
                type
            });

            // 限制日志数量
            if (systemLogs.value.length > 100) {
                systemLogs.value.pop();
            }
        };

        const clearSystemLogs = () => {
            systemLogs.value = [
                { id: Date.now(), time: new Date().toLocaleTimeString(), message: '日志已清空', type: 'info' }
            ];
        };

        const updateUI = () => {
            // 更新连接状态指示器
            if (elements.statusIndicator.value && elements.statusText.value) {
                if (isConnected.value) {
                    elements.statusIndicator.value.classList.add('connected');
                    elements.statusText.value.textContent = '已连接';
                } else {
                    elements.statusIndicator.value.classList.remove('connected');
                    elements.statusText.value.textContent = isConnecting.value ? '连接中...' : '未连接';
                }
            }

            // 更新按钮状态
            if (elements.connectBtn.value) elements.connectBtn.value.disabled = isConnected.value || isConnecting.value;
            if (elements.testBtn.value) elements.testBtn.value.disabled = isConnecting.value;
            if (elements.disconnectBtn.value) elements.disconnectBtn.value.disabled = !isConnected.value;
            if (elements.reconnectBtn.value) elements.reconnectBtn.value.disabled = isConnecting.value;
            if (elements.saveServerBtn.value) elements.saveServerBtn.value.disabled = isConnecting.value;

            // 更新按钮文本
            if (elements.connectBtn.value) {
                if (isConnecting.value) {
                    elements.connectBtn.value.innerHTML = '<span class="loading"></span> 连接中...';
                } else {
                    elements.connectBtn.value.innerHTML = '🔗 连接服务器';
                }
            }
        };

        const saveServerConfig = () => {
            const newUrl = elements.serverUrlInput.value?.value?.trim();

            if (!newUrl) {
                addSystemLog('请输入服务器地址', 'error');
                return;
            }

            if (!newUrl.startsWith('http://') && !newUrl.startsWith('https://')) {
                addSystemLog('服务器地址必须以 http:// 或 https:// 开头', 'error');
                return;
            }

            serverConfig.httpServerUrl = newUrl;
            localStorage.setItem('httpServerUrl', newUrl);
            serverConfig.websocketUrl = null;

            if (isConnected.value) {
                addSystemLog('服务器地址已更新，如需使用新地址请重新连接', 'info');
            } else {
                addSystemLog(`服务器地址已保存: ${newUrl}`, 'success');
            }
        };

        const connect = async () => {
            if (isConnected.value || isConnecting.value) return;

            isConnecting.value = true;
            updateUI();
            addSystemLog('正在获取服务器配置...');

            try {
                const otaUrl = `${serverConfig.httpServerUrl}/xiaozhi/ota/`;
                addSystemLog(`正在访问: ${otaUrl}`);

                const otaResponse = await fetch(otaUrl, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                });

                if (!otaResponse.ok) {
                    const errorText = await otaResponse.text();
                    throw new Error(`OTA接口请求失败 (${otaResponse.status}): ${errorText}`);
                }

                const otaData = await otaResponse.json();

                if (!otaData.websocket_url) {
                    throw new Error('OTA接口未返回websocket_url');
                }

                serverConfig.websocketUrl = otaData.websocket_url;
                addSystemLog(`获取到WebSocket地址: ${otaData.websocket_url}`, 'success');

                isConnected.value = true;
                addSystemLog('连接成功！', 'success');
                connectWebSocket();
                refreshDevices();

            } catch (error) {
                addSystemLog(`连接失败: ${error.message}`, 'error');
                if (error.message.includes('Failed to fetch')) {
                    addSystemLog('提示: 请检查网络连接或服务器地址是否正确', 'info');
                } else if (error.message.includes('404')) {
                    addSystemLog('提示: OTA接口路径可能不正确，请确认服务器已启动', 'info');
                }
            } finally {
                isConnecting.value = false;
                updateUI();
            }
        };

        const connectWebSocket = () => {
            if (ws.value) {
                ws.value.close();
            }

            const wsUrl = new URL(`ws://${window.location.host}/ws`);
            wsUrl.searchParams.append('client_type', 'manager');
            wsUrl.searchParams.append('timestamp', Date.now());

            ws.value = new WebSocket(wsUrl.toString());

            ws.value.onopen = () => {
                console.log('WebSocket连接已建立');
                addSystemLog('WebSocket连接已建立', 'success');
            };

            ws.value.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    console.log('收到WebSocket消息:', message);
                    handleServerMessage(message);
                } catch (error) {
                    console.error('解析WebSocket消息失败:', error);
                }
            };

            ws.value.onclose = () => {
                console.log('WebSocket连接已关闭');
                addSystemLog('WebSocket连接已关闭', 'info');
            };

            ws.value.onerror = (error) => {
                console.error('WebSocket错误:', error);
                addSystemLog('WebSocket连接错误', 'error');
            };
        };

        const handleServerMessage = (message) => {
            console.log('收到服务器消息:', message);

            switch (message.type) {
                case 'connection_ack':
                    if (message.clientId) {
                        clientId.value = message.clientId;
                        addSystemLog(`已获取客户端ID: ${clientId.value}`, 'success');
                    }
                    break;
                case 'hello':
                    if (message.session_id) {
                        addSystemLog(`握手成功，会话ID: ${message.session_id}`, 'success');
                    }
                    break;
                default:
                    addSystemLog(`收到未知类型消息: ${message.type}`, 'info');
            }
        };

        const disconnect = async () => {
            try {
                const response = await fetch(`${serverConfig.httpServerUrl}/api/disconnect`, {
                    method: 'POST'
                });

                const result = await response.json();

                if (result.success) {
                    isConnected.value = false;
                    if (ws.value) {
                        ws.value.close();
                        ws.value = null;
                    }
                    addSystemLog('已断开连接', 'success');
                }
            } catch (error) {
                console.error('断开连接失败:', error);
                addSystemLog(`断开连接失败: ${error.message}`, 'error');
            } finally {
                updateUI();
            }
        };

        const reconnect = async () => {
            await disconnect();
            setTimeout(() => connect(), 1000);
        };

        const testConnection = async () => {
            addSystemLog('正在测试服务器连接...');

            try {
                const testUrl = `${serverConfig.httpServerUrl}/xiaozhi/ota/`;
                addSystemLog(`测试地址: ${testUrl}`);

                const response = await fetch(testUrl, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' }
                });

                addSystemLog(`服务器响应: ${response.status} ${response.statusText}`, 'success');

                if (response.ok) {
                    const data = await response.json();
                    addSystemLog(`OTA接口返回数据: ${JSON.stringify(data)}`, 'success');
                    if (data.websocket_url) {
                        addSystemLog(`成功获取WebSocket地址: ${data.websocket_url}`, 'success');
                    }
                }
            } catch (error) {
                addSystemLog(`测试失败: ${error.message}`, 'error');
                console.error('测试连接错误:', error);
            }
        };

        const refreshDevices = async () => {
            if (!isConnected.value) {
                addSystemLog('请先连接到服务器', 'error');
                return;
            }

            loading.value = true;

            try {
                const response = await fetch(`${serverConfig.httpServerUrl}/api/devices`);
                const result = await response.json();
                console.log('获取设备列表结果:', result);
                if (result.success) {
                    devices.value = result.data || [];
                    addSystemLog(`设备列表刷新成功，共 ${devices.value.length} 个设备`, 'success');
                } else {
                    throw new Error(result.message);
                }
            } catch (error) {
                addSystemLog(`获取设备列表失败: ${error.message}`, 'error');
                devices.value = [];
            } finally {
                loading.value = false;
            }
        };

        const handleSelectionChange = (selection) => {
            selectedDevices.value = selection;
        };

        const handleBatchCommand = (command) => {
            switch (command) {
                case 'disconnect':
                    // 批量断开连接逻辑
                    addSystemLog(`选择了 ${selectedDevices.value.length} 个设备进行批量断开`, 'info');
                    break;
                case 'cleanup':
                    // 清理离线设备逻辑
                    addSystemLog('执行清理离线设备操作', 'info');
                    break;
            }
        };

        const showDeviceDetail = (device) => {
            currentDevice.value = device;
            deviceDetailVisible.value = true;
        };

        const disconnectDevice = async (device) => {
            if (device.status !== 'online') {
                addSystemLog('设备已离线', 'error');
                return;
            }

            try {
                // 这里应该调用实际的断开设备API
                addSystemLog(`正在断开设备 ${device.clientId}`, 'info');
                // 模拟断开操作
                setTimeout(() => {
                    device.status = 'offline';
                    addSystemLog(`设备 ${device.clientId} 已断开连接`, 'success');
                }, 1000);
            } catch (error) {
                addSystemLog(`断开设备失败: ${error.message}`, 'error');
            }
        };

        const showAddDeviceDialog = () => {
            // 添加设备对话框逻辑
            addSystemLog('打开添加设备对话框', 'info');
        };

        // 获取设备类型配置
        const getDeviceTypeConfig = (type) => {
            return DEVICE_TYPES.find(t => t.value === type);
        };

        // 检查设备是否支持拍照
        const canTakePhoto = (device) => {
            if (device.status !== 'online') return false;
            const config = getDeviceTypeConfig(device.deviceType);
            return config ? config.canTakePhoto : false;
        };

        // 检查设备是否支持发送信息
        const canSendMessage = (device) => {
            if (device.status !== 'online') return false;
            const config = getDeviceTypeConfig(device.deviceType);
            return config ? config.canSendMessage : false;
        };

        const takePhoto = async (device) => {
            if (!canTakePhoto(device)) {
                addSystemLog('该设备不支持拍照功能', 'error');
                return;
            }

            try {
                addSystemLog(`正在向设备 ${device.clientId} 发送拍照指令...`, 'info');

                // 通过WebSocket发送拍照指令
                if (ws.value && ws.value.readyState === WebSocket.OPEN) {
                    const photoCommand = {
                        type: 'mcp',
                        name: 'photo',
                        params: { question: "请分析这张图片并解释 " }
                    };
                    const messageCommand = {
                        type: 'friend',
                        clientid: device.clientId,
                        data: photoCommand
                    };

                    ws.value.send(JSON.stringify(messageCommand));
                    addSystemLog(`拍照指令已发送到设备 ${device.clientId}`, 'success');
                } else {
                    addSystemLog('WebSocket连接未建立', 'error');
                }
            } catch (error) {
                addSystemLog(`拍照指令发送失败: ${error.message}`, 'error');
            }
        };

        const openSendMessageDialog = (device) => {
            sendMessageForm.targetClientId = device.clientId;
            sendMessageForm.targetType = device.deviceType;
            // 硬件设备默认语音，网页设备默认语音
            sendMessageForm.messageType = 'tts';
            sendMessageForm.content = '';
            sendMessageForm.isllm = true;
            sendMessageVisible.value = true;
        };

        const sendMessage = async () => {
            if (!sendMessageForm.content.trim()) {
                addSystemLog('请输入消息内容', 'error');
                return;
            }

            try {
                addSystemLog(`正在向设备 ${sendMessageForm.targetClientId} 发送消息...`, 'info');

                if (ws.value && ws.value.readyState === WebSocket.OPEN) {
                    const messageCommand = {
                        type: 'friend',
                        clientid: sendMessageForm.targetClientId,
                        data: {
                            type: sendMessageForm.messageType,
                            content: sendMessageForm.content,
                            isllm: sendMessageForm.isllm,
                            timestamp: new Date().toISOString()
                        }
                    };
                    ws.value.send(JSON.stringify(messageCommand));
                    addSystemLog(`消息已发送到设备 ${sendMessageForm.targetClientId}`, 'success');
                    sendMessageVisible.value = false;
                } else {
                    addSystemLog('WebSocket连接未建立', 'error');
                }
            } catch (error) {
                addSystemLog(`消息发送失败: ${error.message}`, 'error');
            }
        };

        const getDeviceTypeTag = (type) => {
            const deviceType = DEVICE_TYPES.find(t => t.value === type);
            return deviceType ? deviceType.tag : 'info';
        };

        const getDeviceTypeName = (type) => {
            const deviceType = DEVICE_TYPES.find(t => t.value === type);
            return deviceType ? deviceType.label : '未知设备';
        };

        const formatTime = (time) => {
            if (!time) return '-';
            return new Date(time).toLocaleString('zh-CN');
        };

        // 生命周期钩子
        onMounted(() => {
            // 初始化DOM元素引用
            elements.statusIndicator.value = document.getElementById('statusIndicator');
            elements.statusText.value = document.getElementById('statusText');
            elements.connectBtn.value = document.getElementById('connectBtn');
            elements.disconnectBtn.value = document.getElementById('disconnectBtn');
            elements.reconnectBtn.value = document.getElementById('reconnectBtn');
            elements.serverUrlInput.value = document.getElementById('serverUrlInput');
            elements.saveServerBtn.value = document.getElementById('saveServerBtn');
            elements.testBtn.value = document.getElementById('testBtn');

            // 初始化服务器地址显示
            if (elements.serverUrlInput.value) {
                elements.serverUrlInput.value.value = serverConfig.httpServerUrl;
            }
            updateUI();

            // 页面加载后自动连接
            setTimeout(() => {
                addSystemLog('正在自动连接服务器...');
                connect();
            }, 500);
        });

        // 返回响应式数据和方法
        return {
            // 响应式数据
            isConnected,
            isConnecting,
            clientId,
            devices,
            loading,
            searchKeyword,
            filterStatus,
            filterType,
            currentPage,
            pageSize,
            selectedDevices,
            deviceDetailVisible,
            currentDevice,
            activeCollapse,
            sendMessageVisible,
            sendMessageForm,
            systemLogs,
            filteredDevices,
            serverConfig,

            // 方法
            addSystemLog,
            clearSystemLogs,
            updateUI,
            saveServerConfig,
            connect,
            disconnect,
            reconnect,
            testConnection,
            refreshDevices,
            handleSelectionChange,
            handleBatchCommand,
            showDeviceDetail,
            disconnectDevice,
            showAddDeviceDialog,
            takePhoto,
            openSendMessageDialog,
            sendMessage,
            getDeviceTypeTag,
            getDeviceTypeName,
            formatTime,
            DEVICE_TYPES,
            canTakePhoto,
            canSendMessage
        };
    }
});

// 注册Element Plus
app.use(ElementPlus);

// 注册Element Plus图标
Object.keys(ElementPlusIconsVue).forEach(key => {
    app.component(key, ElementPlusIconsVue[key]);
});

// 挂载应用
app.mount('#app');