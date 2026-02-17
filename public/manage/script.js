class XiaoZhiClient {
    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.isConnecting = false;
        
        // DOM元素
        this.elements = {
            statusIndicator: document.getElementById('statusIndicator'),
            statusText: document.getElementById('statusText'),
            connectBtn: document.getElementById('connectBtn'),
            disconnectBtn: document.getElementById('disconnectBtn'),
            reconnectBtn: document.getElementById('reconnectBtn'),
            messageInput: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendBtn'),
            chatContainer: document.getElementById('chatContainer'),
            clearBtn: document.getElementById('clearBtn'),
            // 服务器配置元素
            serverUrlInput: document.getElementById('serverUrlInput'),
            saveServerBtn: document.getElementById('saveServerBtn'),
            // RTN相关元素
            rtnClientSelect: document.getElementById('rtnClientSelect'),
            rtnDataInput: document.getElementById('rtnDataInput'),
            sendRtnBtn: document.getElementById('sendRtnBtn'),
            // 设备列表相关元素
            refreshDevicesBtn: document.getElementById('refreshDevicesBtn'),
            devicesList: document.getElementById('devicesList')
        };
        
        // 服务器配置
        this.serverConfig = {
            websocketUrl: localStorage.getItem('websocketUrl') || 'ws://192.168.1.55:8000/xiaozhi/v1/'
        };
        
        // 初始化服务器地址显示
        this.updateServerUrlDisplay();

        this.setupEventListeners();
        this.updateUI();
    }

    // 设置事件监听器
    setupEventListeners() {
        // 服务器配置
        this.elements.saveServerBtn.addEventListener('click', () => this.saveServerConfig());
        this.elements.serverUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.saveServerConfig();
            }
        });
        
        // 连接按钮
        this.elements.connectBtn.addEventListener('click', () => this.connect());
        
        // 断开连接按钮
        this.elements.disconnectBtn.addEventListener('click', () => this.disconnect());
        
        // 重新连接按钮
        this.elements.reconnectBtn.addEventListener('click', () => this.reconnect());
        
        // 发送按钮
        this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
        
        // 回车发送
        this.elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
        
        // 清空聊天记录
        this.elements.clearBtn.addEventListener('click', () => this.clearChat());
        
        // RTN消息发送
        this.elements.sendRtnBtn.addEventListener('click', () => this.sendRtnMessage());
        
        // RTN输入框回车发送
        this.elements.rtnDataInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendRtnMessage();
            }
        });
        
        // 设备列表刷新
        this.elements.refreshDevicesBtn.addEventListener('click', () => this.refreshDevicesList());
    }

    // 更新UI状态
    updateUI() {
        // 更新连接状态指示器
        if (this.isConnected) {
            this.elements.statusIndicator.classList.add('connected');
            this.elements.statusText.textContent = '已连接';
        } else {
            this.elements.statusIndicator.classList.remove('connected');
            this.elements.statusText.textContent = this.isConnecting ? '连接中...' : '未连接';
        }

        // 更新按钮状态
        this.elements.connectBtn.disabled = this.isConnected || this.isConnecting;
        this.elements.disconnectBtn.disabled = !this.isConnected;
        this.elements.reconnectBtn.disabled = this.isConnecting;
        this.elements.sendBtn.disabled = !this.isConnected;
        this.elements.messageInput.disabled = !this.isConnected;
        // RTN按钮状态
        this.elements.sendRtnBtn.disabled = !this.isConnected;
        this.elements.rtnClientSelect.disabled = !this.isConnected;
        this.elements.rtnDataInput.disabled = !this.isConnected;
        // 设备列表按钮状态
        this.elements.refreshDevicesBtn.disabled = !this.isConnected;
        
        // 服务器配置按钮状态
        this.elements.saveServerBtn.disabled = this.isConnecting;

        // 更新按钮文本
        if (this.isConnecting) {
            this.elements.connectBtn.innerHTML = '<span class="loading"></span> 连接中...';
        } else {
            this.elements.connectBtn.innerHTML = '🔗 连接服务器';
        }
    }

    // 保存服务器配置
    saveServerConfig() {
        const newUrl = this.elements.serverUrlInput.value.trim();
        
        if (!newUrl) {
            this.addSystemMessage('⚠️ 请输入服务器地址');
            return;
        }
        
        // 简单的URL格式验证
        if (!newUrl.startsWith('ws://') && !newUrl.startsWith('wss://')) {
            this.addSystemMessage('⚠️ 服务器地址必须以 ws:// 或 wss:// 开头');
            return;
        }
        
        // 保存到配置和localStorage
        this.serverConfig.websocketUrl = newUrl;
        localStorage.setItem('websocketUrl', newUrl);
        
        // 更新显示
        this.updateServerUrlDisplay();
        
        // 如果当前已连接，提示需要重新连接
        if (this.isConnected) {
            this.addSystemMessage('ℹ️ 服务器地址已更新，如需使用新地址请重新连接');
        } else {
            this.addSystemMessage(`✅ 服务器地址已保存: ${newUrl}`);
        }
        
        console.log('服务器地址已更新:', newUrl);
    }
    
    // 更新服务器地址显示
    updateServerUrlDisplay() {
        if (this.elements.serverUrlInput) {
            this.elements.serverUrlInput.value = this.serverConfig.websocketUrl;
        }
        if (this.elements.serverUrlDisplay) {
            this.elements.serverUrlDisplay.textContent = this.serverConfig.websocketUrl;
        }
    }

    // 连接到服务器
    async connect() {
        if (this.isConnected || this.isConnecting) return;

        this.isConnecting = true;
        this.updateUI();
        this.addSystemMessage('正在连接到服务器...');

        try {
            const response = await fetch('/api/connect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.success) {
                this.isConnected = true;
                this.addSystemMessage('✅ 连接成功！');
                this.connectWebSocket();
                this.updateDeviceInfo();
            } else {
                throw new Error(result.message || '连接失败');
            }
        } catch (error) {
            this.addSystemMessage(`❌ 连接失败: ${error.message}`);
            console.error('连接错误:', error);
        } finally {
            this.isConnecting = false;
            this.updateUI();
        }
    }

    // 连接WebSocket用于实时通信
    connectWebSocket() {
        if (this.ws) {
            this.ws.close();
        }

        this.ws = new WebSocket(`ws://${window.location.host}/ws`);

        this.ws.onopen = () => {
            console.log('WebSocket连接已建立');
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleWebSocketMessage(message);
            } catch (error) {
                console.error('解析WebSocket消息失败:', error);
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket连接已关闭');
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket错误:', error);
        };
    }

    // 处理WebSocket消息
    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'status':
                this.updateConnectionStatus(message.data);
                break;
            case 'message':
                this.handleServerMessage(message.data);
                break;
        }
    }

    // 更新连接状态
    updateConnectionStatus(status) {
        this.isConnected = status.connected;
        this.elements.deviceId.textContent = status.deviceId || '-';
        this.elements.sessionId.textContent = status.sessionId || '-';
        this.updateUI();
    }

    // 处理服务器消息
    handleServerMessage(message) {
        console.log('收到服务器消息:', message);
        
        switch (message.type) {
            case 'hello':
                if (message.session_id) {
                    this.elements.sessionId.textContent = message.session_id;
                    this.addSystemMessage(`🤝 握手成功，会话ID: ${message.session_id}`);
                }
                break;
                
            case 'stt':
                this.addBotMessage(`🎤 语音识别: ${message.text}`);
                break;
                
            case 'llm':
                this.addBotMessage(`🤖 ${message.text}`);
                break;
                
            case 'tts':
                // TTS状态消息，可以选择是否显示
                console.log('TTS状态:', message.state);
                break;
                
            default:
                this.addSystemMessage(`收到未知类型消息: ${message.type}`);
                console.log('未知消息:', message);
        }
    }

    // 更新设备信息
    async updateDeviceInfo() {
        try {
            const response = await fetch('/api/status');
            const result = await response.json();
            
            if (result.success) {
                // 连接成功后自动刷新设备列表
                if (this.isConnected) {
                    setTimeout(() => {
                        this.refreshDevicesList();
                        this.addSystemMessage('🔄 已自动刷新设备列表');
                    }, 1000); // 延迟1秒确保连接完全建立
                }
            }
        } catch (error) {
            console.error('获取设备信息失败:', error);
        }
    }

    // 断开连接
    async disconnect() {
        try {
            const response = await fetch('/api/disconnect', {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success) {
                this.isConnected = false;
                if (this.ws) {
                    this.ws.close();
                    this.ws = null;
                }
                this.addSystemMessage('🔌 已断开连接');
            }
        } catch (error) {
            console.error('断开连接失败:', error);
        } finally {
            this.updateUI();
        }
    }

    // 重新连接
    async reconnect() {
        await this.disconnect();
        setTimeout(() => this.connect(), 1000);
    }

    // 发送消息
    async sendMessage() {
        const text = this.elements.messageInput.value.trim();
        
        if (!text) {
            this.elements.messageInput.focus();
            return;
        }

        if (!this.isConnected) {
            this.addSystemMessage('⚠️ 请先连接到服务器');
            return;
        }

        // 显示用户消息
        this.addUserMessage(text);
        
        // 清空输入框
        this.elements.messageInput.value = '';
        this.elements.messageInput.focus();

        try {
            const response = await fetch('/api/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text })
            });

            const result = await response.json();

            if (!result.success) {
                this.addSystemMessage(`❌ 发送失败: ${result.message}`);
            }
        } catch (error) {
            this.addSystemMessage(`❌ 发送失败: ${error.message}`);
            console.error('发送消息错误:', error);
        }
    }

    // 发送RTN消息
    async sendRtnMessage() {
        const client = this.elements.rtnClientSelect.value;
        const data = this.elements.rtnDataInput.value.trim();
        
        if (!client || !data) {
            this.addSystemMessage('⚠️ 请选择目标设备并输入消息内容');
            if (!client) this.elements.rtnClientSelect.focus();
            else this.elements.rtnDataInput.focus();
            return;
        }

        if (!this.isConnected) {
            this.addSystemMessage('⚠️ 请先连接到服务器');
            return;
        }

        // 显示RTN消息发送
        this.addSystemMessage(`📤 发送RTN消息到 ${client}: ${data}`);
        
        // 清空输入框
        this.elements.rtnDataInput.value = '';
        this.elements.rtnDataInput.focus();

        try {
            const rtnMessage = {
                type: "rtn",
                client: client,
                data: data
            };

            const response = await fetch('/api/rtn', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(rtnMessage)
            });

            const result = await response.json();

            if (result.success) {
                this.addSystemMessage(`✅ RTN消息发送成功: ${result.message}`);
                this.addSystemMessage(`   目标设备: ${result.targetClient}`);
                this.addSystemMessage(`   转发内容: ${result.forwarded}`);
            } else {
                this.addSystemMessage(`❌ RTN消息发送失败: ${result.message}`);
            }
        } catch (error) {
            this.addSystemMessage(`❌ RTN消息发送失败: ${error.message}`);
            console.error('发送RTN消息错误:', error);
        }
    }

    // 刷新设备列表
    async refreshDevicesList() {
        if (!this.isConnected) {
            this.addSystemMessage('⚠️ 请先连接到服务器');
            return;
        }

        try {
            this.elements.devicesList.innerHTML = '<div style="text-align: center; padding: 20px;"><span class="loading"></span> 正在获取设备列表...</div>';
            
            const response = await fetch('/api/devices');
            const result = await response.json();
            
            if (result.success) {
                this.displayDevicesList(result.data);
                this.addSystemMessage('✅ 设备列表刷新成功');
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            this.elements.devicesList.innerHTML = `<div style="text-align: center; color: #dc3545; padding: 20px;">❌ 获取设备列表失败: ${error.message}</div>`;
            this.addSystemMessage(`❌ 获取设备列表失败: ${error.message}`);
        }
    }

    // 显示设备列表
    displayDevicesList(devicesData) {
        let html = '';
        
        // 显示统计信息
        if (devicesData && devicesData.data) {
            const data = devicesData.data;
            
            // 过滤掉本客户端设备（以node_client_开头的设备）
            const otherDevices = data.devices ? data.devices.filter(device => 
                !device.device_id.startsWith('node_client_')
            ) : [];
            
            const otherDeviceCount = otherDevices.length;
            const totalCount = data.total_devices || 0;
            
            html += `
                <div style="margin-bottom: 15px; padding: 10px; background: #e8f5e8; border-radius: 5px; border-left: 3px solid #28a745;">
                    <div style="font-weight: bold; color: #155724;">📊 设备统计</div>
                    <div style="margin-top: 5px; font-size: 13px;">
                        其他设备数: <strong>${otherDeviceCount}</strong> 个<br>
                        总设备数: ${totalCount} 个<br>
                        服务器时间: ${new Date(data.timestamp).toLocaleString('zh-CN')}<br>
                        WebSocket端口: ${data.server_info?.websocket_port || 'N/A'}<br>
                        HTTP端口: ${data.server_info?.http_port || 'N/A'}
                    </div>
                </div>
            `;
            
            // 显示其他设备详情
            if (otherDevices.length > 0) {
                html += '<div style="font-weight: bold; margin-bottom: 10px; color: #495057;">📋 其他活跃设备列表:</div>';
                
                otherDevices.forEach((device, index) => {
                    const connectedTime = device.connected_at ? new Date(device.connected_at).toLocaleString('zh-CN') : 'N/A';
                    const lastActivity = device.last_activity ? new Date(device.last_activity).toLocaleString('zh-CN') : 'N/A';
                    
                    // 根据设备类型设置不同的颜色
                    const isEsp32 = device.client_ip !== '192.168.1.55'; // 非Node.js服务器IP的设备认为是ESP32
                    const borderColor = isEsp32 ? '#28a745' : '#6c757d';
                    const titleColor = isEsp32 ? '#28a745' : '#6c757d';
                    const deviceType = isEsp32 ? 'ESP32设备' : '其他设备';
                    
                    html += `
                        <div style="margin-bottom: 8px; padding: 8px; background: #f8f9fa; border-radius: 5px; border-left: 3px solid ${borderColor};">
                            <div style="font-weight: bold; color: ${titleColor}; font-size: 13px;">📱 ${deviceType} ${index + 1}</div>
                            <div style="margin-top: 5px; font-family: monospace; font-size: 12px; color: #495057;">
                                设备ID: ${device.device_id}<br>
                                会话ID: ${device.session_id}<br>
                                客户端IP: ${device.client_ip}<br>
                                连接时间: ${connectedTime}<br>
                                最后活动: ${lastActivity}
                            </div>
                        </div>
                    `;
                });
            } else {
                html += '<div style="text-align: center; color: #6c757d; padding: 15px;">暂无其他设备连接</div>';
            }
            
            // 如果有过滤掉的本机设备，显示提示
            const filteredDevices = data.devices ? data.devices.filter(device => 
                device.device_id.startsWith('node_client_')
            ) : [];
            
            if (filteredDevices.length > 0) {
                html += `
                    <div style="margin-top: 15px; padding: 8px; background: #fff3cd; border-radius: 5px; border-left: 3px solid #ffc107; font-size: 12px; color: #856404;">
                        ℹ️ 已过滤 ${filteredDevices.length} 个本机客户端设备
                    </div>
                `;
            }
            
            // 更新RTN下拉框选项
            this.updateRtnDeviceOptions(otherDevices);
        } else {
            html = '<div style="text-align: center; color: #6c757d; padding: 20px;">暂无设备信息</div>';
            // 清空RTN下拉框
            this.updateRtnDeviceOptions([]);
        }
        
        this.elements.devicesList.innerHTML = html;
    }
    
    // 更新RTN消息目标设备下拉框选项
    updateRtnDeviceOptions(devices) {
        const selectElement = this.elements.rtnClientSelect;
        
        // 保存当前选中的值
        const currentValue = selectElement.value;
        
        // 清空现有选项（保留第一个提示选项）
        selectElement.innerHTML = '<option value="">请选择目标设备</option>';
        
        // 添加设备选项
        if (devices && devices.length > 0) {
            devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device.device_id;
                
                // 根据设备类型设置显示文本
                const isEsp32 = device.client_ip !== '192.168.1.55';
                const deviceType = isEsp32 ? '[ESP32]' : '[其他]';
                option.textContent = `${deviceType} ${device.device_id}`;
                
                selectElement.appendChild(option);
            });
            
            // 如果之前选中的值还在选项中，恢复选择
            if (currentValue && Array.from(selectElement.options).some(opt => opt.value === currentValue)) {
                selectElement.value = currentValue;
            }
            
            this.addSystemMessage(`🔄 RTN目标设备列表已更新，共 ${devices.length} 个可选设备`);
        } else {
            this.addSystemMessage('⚠️ 暂无可选的目标设备');
        }
    }

    // 添加用户消息
    addUserMessage(text) {
        this.addMessage(text, 'user');
    }

    // 添加机器人消息
    addBotMessage(text) {
        this.addMessage(text, 'bot');
    }

    // 添加系统消息
    addSystemMessage(text) {
        this.addMessage(text, 'system');
    }

    // 添加消息到聊天区域
    addMessage(content, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'message-header';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;

        const now = new Date();
        const timeString = now.toLocaleTimeString('zh-CN', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });

        switch (type) {
            case 'user':
                headerDiv.textContent = `我 · ${timeString}`;
                break;
            case 'bot':
                headerDiv.textContent = `小智 · ${timeString}`;
                break;
            case 'system':
                headerDiv.textContent = timeString;
                break;
        }

        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);
        this.elements.chatContainer.appendChild(messageDiv);

        // 滚动到底部
        this.elements.chatContainer.scrollTop = this.elements.chatContainer.scrollHeight;
    }

    // 清空聊天记录
    clearChat() {
        const messages = this.elements.chatContainer.querySelectorAll('.message');
        messages.forEach((msg, index) => {
            // 保留第一条欢迎消息
            if (index > 0) {
                msg.remove();
            }
        });
        this.addSystemMessage('🗑️ 聊天记录已清空');
    }
}

// 页面加载完成后初始化客户端
document.addEventListener('DOMContentLoaded', () => {
    window.xiaoZhiClient = new XiaoZhiClient();
});

// 页面卸载时断开连接
window.addEventListener('beforeunload', () => {
    if (window.xiaoZhiClient && window.xiaoZhiClient.ws) {
        window.xiaoZhiClient.ws.close();
    }
});