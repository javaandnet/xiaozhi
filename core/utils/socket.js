// SocketClient.js
import axios from 'axios';
import CryptoJS from 'crypto-js';
import io from 'socket.io-client';

// MD5 加密函数
function md5(text) {
    return CryptoJS.MD5(text).toString();
}

class SocketClient {
    constructor(serverUrl, credentials) {
        this.serverUrl = serverUrl;
        this.credentials = credentials;
        this.socket = null;
        this.isConnected = false;
        this.axiosInstance = axios.create({
            baseURL: serverUrl,
            withCredentials: true,
            timeout: 5000
        });
    }

    async login() {
        try {
            const response = await this.axiosInstance.post('/index/login', {
                username: this.credentials.username,
                password: md5(this.credentials.password)
            });
            console.log('🔒 登录成功:', response.data);

            // 返回完整的响应对象，包含 headers
            return response;
        } catch (error) {
            throw new Error(`登录失败: ${error.message}`);
        }
    }

    async connect() {
        try {
            // 先登录并获取 cookies
            const loginResponse = await this.login();

            // 从 axios 响应中提取 cookies
            const cookies = loginResponse.headers?.['set-cookie'] || [];
            const cookieString = cookies.join('; ');

            console.log('🍪 获取到的 Cookie:', cookieString);

            // 建立 Socket 连接，手动传递 cookies
            // 注意：extraHeaders 只在 polling 时生效，WebSocket 需要用 transportOptions
            this.socket = io(this.serverUrl, {
                withCredentials: true,
                transports: ['polling', 'websocket'],  // 先用 polling 建立 session，再升级到 websocket
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                // 关键：在 Node.js 环境中需要手动传递 cookies
                extraHeaders: {
                    'Cookie': cookieString
                },
                // 确保 polling 传输时也携带 cookies
                transportOptions: {
                    polling: {
                        extraHeaders: {
                            'Cookie': cookieString
                        }
                    }
                }
            });

            // 设置事件监听器
            this.setupEventListeners();

            return new Promise((resolve, reject) => {
                this.socket.on('connect', () => {
                    this.isConnected = true;
                    console.log('✅ Socket 连接成功');
                    resolve(this.socket);
                });

                this.socket.on('connect_error', (error) => {
                    reject(new Error(`连接失败: ${error.message}`));
                });
            });

        } catch (error) {
            throw new Error(`连接建立失败: ${error.message}`);
        }
    }

    setupEventListeners() {
        // 连接相关事件
        this.socket.on('disconnect', (reason) => {
            this.isConnected = false;
            console.log('🔌 连接断开:', reason);
        });

        this.socket.on('reconnect', (attemptNumber) => {
            console.log('🔄 重新连接成功，尝试次数:', attemptNumber);
            this.isConnected = true;
        });

        this.socket.on('reconnect_attempt', (attemptNumber) => {
            console.log('🔁 正在尝试重新连接:', attemptNumber);
        });

        // 业务事件
        this.socket.on('quest:TaskStatus', (data) => {
            console.log('📊 任务状态更新:', data);
            this.onTaskStatus?.(data);
        });

        this.socket.on('quest:RtnCategory', (data) => {
            console.log('📋 返回分类:', data);
            this.onRtnCategory?.(data);
        });

        this.socket.on('quest:complete', (data) => {
            console.log('✅ 任务完成:', data);
            this.onTaskComplete?.(data);
        });

        this.socket.on('quest:error', (error) => {
            console.error('❌ 任务错误:', error);
            this.onTaskError?.(error);
        });
    }

    // 发送聊天消息
    sendChatMessage(message, questId, options = {}) {
        if (!this.isConnected) {
            throw new Error('Socket 未连接');
        }

        const payload = {
            userMessage: message,
            questId: questId,
            isTest: options.isTest || false,
            exeOnly: options.exeOnly || false,
            agent: options.agent || 'main',
            checkpointId: options.checkpointId || null
        };

        console.log('📤 发送消息:', payload);
        this.socket.emit('quest:chatToTask', payload);
    }

    // 获取任务树
    getTaskTree(questId, agent = 'main') {
        if (!this.isConnected) {
            throw new Error('Socket 未连接');
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('获取任务树超时'));
            }, 10000);

            this.socket.once('quest:tasktree', (data) => {
                clearTimeout(timeout);
                resolve(data);
            });

            this.socket.emit('quest:tasktree', { questId, agent });
        });
    }

    // 断开连接
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.isConnected = false;
            console.log('🔌 已断开连接');
        }
    }

    // 设置回调函数
    setOnTaskStatus(callback) {
        this.onTaskStatus = callback;
    }

    setOnRtnCategory(callback) {
        this.onRtnCategory = callback;
    }

    setOnTaskComplete(callback) {
        this.onTaskComplete = callback;
    }

    setOnTaskError(callback) {
        this.onTaskError = callback;
    }
}

export default SocketClient;
