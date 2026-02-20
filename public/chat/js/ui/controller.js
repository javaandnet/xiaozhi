// UI controller module
import { loadConfig, saveConfig } from '../config/manager.js?v=0205';
import { getAudioPlayer } from '../core/audio/player.js?v=0205';
import { getAudioRecorder } from '../core/audio/recorder.js?v=0205';
import { getWebSocketHandler } from '../core/network/websocket.js?v=0205';

// UI controller class
class UIController {
    constructor() {
        this.isEditing = false;
        this.visualizerCanvas = null;
        this.visualizerContext = null;
        this.audioStatsTimer = null;
        this.currentBackgroundIndex = localStorage.getItem('backgroundIndex') ? parseInt(localStorage.getItem('backgroundIndex')) : 0;
        this.backgroundImages = ['1.png', '2.png', '3.png'];
        this.dialBtnDisabled = false;

        // Bind methods
        this.init = this.init.bind(this);
        this.initEventListeners = this.initEventListeners.bind(this);
        this.updateDialButton = this.updateDialButton.bind(this);
        this.addChatMessage = this.addChatMessage.bind(this);
        this.switchBackground = this.switchBackground.bind(this);
        this.switchLive2DModel = this.switchLive2DModel.bind(this);
        this.showModal = this.showModal.bind(this);
        this.hideModal = this.hideModal.bind(this);
        this.switchTab = this.switchTab.bind(this);
    }

    // Initialize
    init() {
        console.log('UIController init started');

        this.visualizerCanvas = document.getElementById('audioVisualizer');
        if (this.visualizerCanvas) {
            this.visualizerContext = this.visualizerCanvas.getContext('2d');
            this.initVisualizer();
        }

        // Check if connect button exists during initialization
        const connectBtn = document.getElementById('connectBtn');
        console.log('connectBtn during init:', connectBtn);

        this.initEventListeners();
        this.startAudioStatsMonitor();
        loadConfig();

        // Register recording callback
        const audioRecorder = getAudioRecorder();
        audioRecorder.onRecordingStart = (seconds) => {
            this.updateRecordButtonState(true, seconds);
        };

        // Initialize status display
        this.updateConnectionUI(false);
        // Apply saved background
        const backgroundContainer = document.querySelector('.background-container');
        if (backgroundContainer) {
            backgroundContainer.style.backgroundImage = `url('./images/${this.backgroundImages[this.currentBackgroundIndex]}')`;
        }

        this.updateDialButton(false);

        // 页面初始化时请求麦克风权限
        this.requestMicrophonePermission();

        console.log('UIController init completed');
    }

    /**
     * 请求麦克风权限（页面初始化时）
     * 所有设备都在初始化时请求，提前获取用户授权
     */
    async requestMicrophonePermission() {
        // 检查是否支持 getUserMedia
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('浏览器不支持 getUserMedia API');
            window.microphoneAvailable = false;
            return;
        }

        console.log('正在请求麦克风权限...');

        try {
            // 请求麦克风权限
            const audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000,
                    channelCount: 1
                }
            });

            // 立即停止媒体流，释放麦克风（只是获取权限）
            audioStream.getTracks().forEach(track => track.stop());

            console.log('✅ 麦克风权限请求成功');
            window.microphoneAvailable = true;

            // 更新录音按钮状态
            this.updateRecordButtonAvailability(true);

        } catch (error) {
            console.warn('❌ 麦克风权限请求失败:', error.message);
            window.microphoneAvailable = false;

            // 根据错误类型显示不同提示
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                console.warn('用户拒绝了麦克风权限');
            } else if (error.name === 'NotFoundError') {
                console.warn('未找到麦克风设备');
            }

            // 更新录音按钮状态
            this.updateRecordButtonAvailability(false);
        }
    }

    /**
     * 更新录音按钮可用性
     */
    updateRecordButtonAvailability(available) {
        const recordBtn = document.getElementById('recordBtn');
        const testRecordBtn = document.getElementById('testRecordBtn');

        if (testRecordBtn) {
            if (available) {
                testRecordBtn.disabled = false;
                testRecordBtn.title = '测试录音（本地）';
            } else {
                testRecordBtn.disabled = true;
                testRecordBtn.title = '麦克风不可用';
            }
        }

        // 正常录音按钮需要连接服务器后才能使用
        if (recordBtn && available) {
            const isConnected = window.wsConnected || false;
            if (isConnected) {
                recordBtn.disabled = false;
                recordBtn.title = '开始录音';
            }
        }
    }

    /**
     * 请求移动设备权限（麦克风和音频）
     * iPhone等移动设备需要用户交互才能请求权限
     */
    async requestMobilePermissions() {
        // 检测是否为移动设备
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (!isMobile) {
            return;
        }

        console.log('检测到移动设备，正在请求权限...');

        try {
            // 请求麦克风权限
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                try {
                    const audioStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            sampleRate: 16000,
                            channelCount: 1
                        }
                    });
                    // 立即停止，只是请求权限
                    audioStream.getTracks().forEach(track => track.stop());
                    console.log('麦克风权限请求成功');
                    window.microphoneAvailable = true;
                } catch (audioError) {
                    console.warn('麦克风权限请求失败:', audioError.message);
                    window.microphoneAvailable = false;
                }
            }

            // 请求音频播放权限（iOS需要）
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                    console.log('音频上下文已恢复');
                }
                await audioContext.close();
            } catch (ctxError) {
                console.warn('音频上下文请求失败:', ctxError.message);
            }

        } catch (error) {
            console.error('请求移动设备权限时出错:', error);
        }
    }

    // Initialize visualizer
    initVisualizer() {
        if (this.visualizerCanvas) {
            this.visualizerCanvas.width = this.visualizerCanvas.clientWidth;
            this.visualizerCanvas.height = this.visualizerCanvas.clientHeight;
            this.visualizerContext.fillStyle = '#fafafa';
            this.visualizerContext.fillRect(0, 0, this.visualizerCanvas.width, this.visualizerCanvas.height);
        }
    }

    // Initialize event listeners
    initEventListeners() {
        // Settings button
        const settingsBtn = document.getElementById('settingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                this.showModal('settingsModal');
            });
        }

        // Background switch button
        const backgroundBtn = document.getElementById('backgroundBtn');
        if (backgroundBtn) {
            backgroundBtn.addEventListener('click', this.switchBackground);
        }

        // Model select change event
        const modelSelect = document.getElementById('live2dModelSelect');
        if (modelSelect) {
            modelSelect.addEventListener('change', () => {
                this.switchLive2DModel();
            });
        }

        // Camera switch button
        const cameraSwitch = document.getElementById('cameraSwitch');
        if (cameraSwitch) {
            cameraSwitch.addEventListener('click', () => {
                window.switchCamera();
            })
        }

        // Dial button
        const dialBtn = document.getElementById('dialBtn');
        if (dialBtn) {
            dialBtn.addEventListener('click', async () => {
                dialBtn.disabled = true;
                this.dialBtnDisabled = true;
                setTimeout(() => {
                    dialBtn.disabled = false;
                    this.dialBtnDisabled = false;
                }, 3000);

                const wsHandler = getWebSocketHandler();
                const isConnected = wsHandler.isConnected();

                if (isConnected) {
                    wsHandler.disconnect();
                    this.updateDialButton(false);
                    if (cameraSwitch) cameraSwitch.classList.remove('active');
                    this.addChatMessage('Disconnected, see you next time~😊', false);
                } else {
                    // Check if OTA URL is filled
                    const otaUrlInput = document.getElementById('otaUrl');
                    if (!otaUrlInput || !otaUrlInput.value.trim()) {
                        // If OTA URL is not filled, show settings modal and switch to device tab
                        this.showModal('settingsModal');
                        this.switchTab('device');
                        this.addChatMessage('Please fill in OTA server URL', false);
                        return;
                    }

                    // 在移动设备上，提前请求麦克风和音频权限（需要用户交互触发）
                    await this.requestMobilePermissions();

                    // Start connection process
                    this.handleConnect();
                }
            });
        }

        // Camera button
        const cameraBtn = document.getElementById('cameraBtn');
        let cameraTimer = null;
        if (cameraBtn) {
            cameraBtn.addEventListener('click', () => {
                if (cameraTimer) {
                    clearTimeout(cameraTimer);
                    cameraTimer = null;
                }
                cameraTimer = setTimeout(() => {
                    const cameraContainer = document.getElementById('cameraContainer');
                    if (!cameraContainer) {
                        log('摄像头容器不存在', 'warning');
                        return;
                    }

                    const isActive = cameraContainer.classList.contains('active');
                    if (isActive) {
                        // 关闭摄像头
                        if (typeof window.stopCamera === 'function') {
                            if (cameraSwitch) cameraSwitch.classList.remove('active');
                            window.stopCamera();
                        }
                        cameraContainer.classList.remove('active');
                        cameraBtn.classList.remove('camera-active');
                        cameraBtn.title = '打开摄像头';
                        log('摄像头已关闭', 'info');
                    } else {
                        // 打开摄像头
                        if (typeof window.startCamera === 'function') {
                            window.startCamera().then(success => {
                                if (success) {
                                    cameraBtn.classList.add('camera-active');
                                    cameraBtn.title = '关闭摄像头';
                                } else {
                                    this.addChatMessage('⚠️ 摄像头启动失败，请检查浏览器权限', false);
                                }
                            }).catch(error => {
                                log(`启动摄像头异常: ${error.message}`, 'error');
                            });
                        } else {
                            log('startCamera函数未定义', 'warning');
                        }
                    }
                }, 300);
            });
        }

        // Record button
        const recordBtn = document.getElementById('recordBtn');
        if (recordBtn) {
            let recordTimer = null;
            recordBtn.addEventListener('click', () => {
                if (recordTimer) {
                    clearTimeout(recordTimer);
                    recordTimer = null;
                }
                recordTimer = setTimeout(() => {
                    const audioRecorder = getAudioRecorder();
                    audioRecorder.setTestMode(false); // 正常模式
                    if (audioRecorder.isRecording) {
                        audioRecorder.stop();
                        // Restore record button to normal state
                        recordBtn.classList.remove('recording');
                        recordBtn.title = '开始录音';
                    } else {
                        // Update button state to recording
                        recordBtn.classList.add('recording');
                        recordBtn.title = '录音中';

                        // Start recording, update button state after delay
                        setTimeout(() => {
                            audioRecorder.start();
                        }, 100);
                    }
                }, 300);
            });
        }

        // Test Record button - 本地测试录音
        const testRecordBtn = document.getElementById('testRecordBtn');
        if (testRecordBtn) {
            let testRecordTimer = null;
            testRecordBtn.addEventListener('click', () => {
                if (testRecordTimer) {
                    clearTimeout(testRecordTimer);
                    testRecordTimer = null;
                }
                testRecordTimer = setTimeout(() => {
                    const audioRecorder = getAudioRecorder();
                    audioRecorder.setTestMode(true); // 测试模式

                    if (audioRecorder.isRecording) {
                        // 停止录音并显示统计
                        audioRecorder.stop();
                        testRecordBtn.classList.remove('recording');
                        testRecordBtn.title = '测试录音（本地）';

                        // 显示统计和选项
                        setTimeout(() => {
                            const stats = audioRecorder.getFormattedStats();
                            console.log(stats);

                            // 创建自定义弹窗
                            this.showRecordingResultModal(audioRecorder, stats);
                        }, 200);
                    } else {
                        // 开始测试录音
                        testRecordBtn.classList.add('recording');
                        testRecordBtn.title = '停止测试录音';

                        setTimeout(() => {
                            audioRecorder.start().then(success => {
                                if (success) {
                                    console.log('🎤 测试录音已开始，请说话...');
                                } else {
                                    testRecordBtn.classList.remove('recording');
                                    testRecordBtn.title = '测试录音（本地）';
                                    alert('录音启动失败，请检查麦克风权限');
                                }
                            });
                        }, 100);
                    }
                }, 300);
            });
        }

        // Chat input event listener
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            const wsHandler = getWebSocketHandler();
            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    if (e.target.value) {
                        wsHandler.sendTextMessage(e.target.value);
                        e.target.value = '';
                        return;
                    }
                }
            });
        }

        // Close button
        const closeButtons = document.querySelectorAll('.close-btn');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const modal = e.target.closest('.modal');
                if (modal) {
                    if (modal.id === 'settingsModal') {
                        saveConfig();
                    }
                    this.hideModal(modal.id);
                }
            });
        });

        // Settings tab switch
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // 点击模态框背景关闭（仅对特定模态框禁用此功能）
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    // settingsModal、mcpToolModal、mcpPropertyModal 只能通过点击X关闭
                    const nonClosableModals = ['settingsModal', 'mcpToolModal', 'mcpPropertyModal'];
                    if (nonClosableModals.includes(modal.id)) {
                        return; // 禁止点击背景关闭
                    }
                    this.hideModal(modal.id);
                }
            });
        });

        // Add MCP tool button
        const addMCPToolBtn = document.getElementById('addMCPToolBtn');
        if (addMCPToolBtn) {
            addMCPToolBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.addMCPTool();
            });
        }

        // Connect button and send button are not removed, can be added to dial button later
    }

    // Update connection status UI
    updateConnectionUI(isConnected) {
        const connectionStatus = document.getElementById('connectionStatus');
        const statusDot = document.querySelector('.status-dot');

        if (connectionStatus) {
            if (isConnected) {
                connectionStatus.textContent = '已连接';
                if (statusDot) {
                    statusDot.className = 'status-dot status-connected';
                }
            } else {
                connectionStatus.textContent = '离线';
                if (statusDot) {
                    statusDot.className = 'status-dot status-disconnected';
                }
            }
        }
    }

    // Update dial button state
    updateDialButton(isConnected) {
        const dialBtn = document.getElementById('dialBtn');
        const recordBtn = document.getElementById('recordBtn');
        const cameraBtn = document.getElementById('cameraBtn');

        if (dialBtn) {
            if (isConnected) {
                dialBtn.classList.add('dial-active');
                dialBtn.title = '挂断';
                // Update dial button icon to hang up icon
                dialBtn.querySelector('svg').innerHTML = `
                    <path d="M12,9C10.4,9 9,10.4 9,12C9,13.6 10.4,15 12,15C13.6,15 15,13.6 15,12C15,10.4 13.6,9 12,9M12,17C9.2,17 7,14.8 7,12C7,9.2 9.2,7 12,7C14.8,7 17,9.2 17,12C17,14.8 14.8,17 12,17M12,4.5C7,4.5 2.7,7.6 1,12C2.7,16.4 7,19.5 12,19.5C17,19.5 21.3,16.4 23,12C21.3,7.6 17,4.5 12,4.5Z"/>
                `;
            } else {
                dialBtn.classList.remove('dial-active');
                dialBtn.title = '拨号';
                // Restore dial button icon
                dialBtn.querySelector('svg').innerHTML = `
                    <path d="M6.62,10.79C8.06,13.62 10.38,15.94 13.21,17.38L15.41,15.18C15.69,14.9 16.08,14.82 16.43,14.93C17.55,15.3 18.75,15.5 20,15.5A1,1 0 0,1 21,16.5V20A1,1 0 0,1 20,21A17,17 0 0,1 3,4A1,1 0 0,1 4,3H7.5A1,1 0 0,1 8.5,4C8.5,5.25 8.7,6.45 9.07,7.57C9.18,7.92 9.1,8.31 8.82,8.59L6.62,10.79Z"/>
                `;
            }
        }

        // Update camera button state - reset to default when disconnected
        if (cameraBtn && !isConnected) {
            const cameraContainer = document.getElementById('cameraContainer');
            if (cameraContainer && cameraContainer.classList.contains('active')) {
                cameraContainer.classList.remove('active');
            }
            cameraBtn.classList.remove('camera-active');
            cameraBtn.title = '摄像头';
            cameraBtn.disabled = true;
            // 关闭摄像头
            if (typeof window.stopCamera === 'function') {
                window.stopCamera();
            }
        }

        // Update camera button state - enable when connected and camera is available
        if (cameraBtn && isConnected) {
            if (window.cameraAvailable) {
                cameraBtn.disabled = false;
                cameraBtn.title = '打开/关闭摄像头';
            } else {
                cameraBtn.disabled = true;
                cameraBtn.title = '请先绑定验证码';
            }
        }

        // Update record button state
        if (recordBtn) {
            const microphoneAvailable = window.microphoneAvailable !== false;
            if (isConnected && microphoneAvailable) {
                recordBtn.disabled = false;
                recordBtn.title = '开始录音';
                recordBtn.classList.remove('recording');
            } else {
                recordBtn.disabled = true;
                if (!microphoneAvailable) {
                    recordBtn.title = window.isHttpNonLocalhost ? '当前由于是http访问，无法录音，只能用文字交互' : '麦克风不可用';
                } else {
                    recordBtn.title = '请先连接服务器';
                }
                recordBtn.classList.remove('recording');
            }
        }
    }

    // Update record button state
    updateRecordButtonState(isRecording, seconds = 0) {
        const recordBtn = document.getElementById('recordBtn');
        if (recordBtn) {
            if (isRecording) {
                recordBtn.title = '录音中';
                recordBtn.classList.add('recording');
            } else {
                recordBtn.title = '开始录音';
                recordBtn.classList.remove('recording');
            }
            // Only enable button when microphone is available
            recordBtn.disabled = window.microphoneAvailable === false;
        }
    }

    /**
     * Update microphone availability state
     * @param {boolean} isAvailable - Whether microphone is available
     * @param {boolean} isHttpNonLocalhost - Whether it is HTTP non-localhost access
     */
    updateMicrophoneAvailability(isAvailable, isHttpNonLocalhost) {
        const recordBtn = document.getElementById('recordBtn');
        if (!recordBtn) return;
        if (!isAvailable) {
            // Disable record button
            recordBtn.disabled = true;
            recordBtn.title = isHttpNonLocalhost ? '当前由于是http访问，无法录音，只能用文字交互' : '麦克风不可用';

        } else {
            // If connected, enable record button
            const wsHandler = getWebSocketHandler();
            if (wsHandler && wsHandler.isConnected()) {
                recordBtn.disabled = false;
                recordBtn.title = '开始录音';
            }
        }
    }

    // Add chat message
    addChatMessage(content, isUser = false) {
        const chatStream = document.getElementById('chatStream');
        if (!chatStream) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${isUser ? 'user' : 'ai'}`;
        messageDiv.innerHTML = `<div class="message-bubble">${content}</div>`;
        chatStream.appendChild(messageDiv);

        // Scroll to bottom
        chatStream.scrollTop = chatStream.scrollHeight;
    }

    // Switch background
    switchBackground() {
        this.currentBackgroundIndex = (this.currentBackgroundIndex + 1) % this.backgroundImages.length;
        const backgroundContainer = document.querySelector('.background-container');
        if (backgroundContainer) {
            backgroundContainer.style.backgroundImage = `url('./images/${this.backgroundImages[this.currentBackgroundIndex]}')`;
        }
        localStorage.setItem('backgroundIndex', this.currentBackgroundIndex);
    }

    // Switch Live2D model
    switchLive2DModel() {
        const modelSelect = document.getElementById('live2dModelSelect');
        if (!modelSelect) {
            console.error('模型选择下拉框不存在');
            return;
        }

        const selectedModel = modelSelect.value;
        const app = window.chatApp;

        if (app && app.live2dManager) {
            app.live2dManager.switchModel(selectedModel)
                .then(success => {
                    if (success) {
                        this.addChatMessage(`已切换到模型: ${selectedModel}`, false);
                    } else {
                        this.addChatMessage('模型切换失败', false);
                    }
                })
                .catch(error => {
                    console.error('模型切换错误:', error);
                    this.addChatMessage('模型切换出错', false);
                });
        } else {
            this.addChatMessage('Live2D管理器未初始化', false);
        }
    }

    // Show modal
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    // Hide modal
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    }

    // Switch tab
    switchTab(tabName) {
        // Remove active class from all tabs
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabBtns.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        // Activate selected tab
        const activeTabBtn = document.querySelector(`[data-tab="${tabName}"]`);
        const activeTabContent = document.getElementById(`${tabName}Tab`);

        if (activeTabBtn && activeTabContent) {
            activeTabBtn.classList.add('active');
            activeTabContent.classList.add('active');
        }
    }

    // Start AI chat session after connection
    startAIChatSession() {
        this.addChatMessage('连接成功，开始聊天吧~😊', false);
        // Check microphone availability and show error messages if needed
        if (!window.microphoneAvailable) {
            if (window.isHttpNonLocalhost) {
                this.addChatMessage('⚠️ 当前由于是http访问，无法录音，只能用文字交互', false);
            } else {
                this.addChatMessage('⚠️ 麦克风不可用，请检查权限设置，只能用文字交互', false);
            }
        }
        // 不再自动开始录音，让用户手动点击录音按钮
        // Start camera only if camera is available (bound with verification code)
        if (window.cameraAvailable && typeof window.startCamera === 'function') {
            window.startCamera().then(success => {
                if (success) {
                    const cameraBtn = document.getElementById('cameraBtn');
                    if (cameraBtn) {
                        cameraBtn.classList.add('camera-active');
                        cameraBtn.title = '关闭摄像头';
                    }
                } else {
                    this.addChatMessage('⚠️ 摄像头启动失败，可能被浏览器拒绝', false);
                }
            }).catch(error => {
                log(`启动摄像头异常: ${error.message}`, 'error');
            });
        }
    }

    // Handle connect button click
    async handleConnect() {
        console.log('handleConnect called');

        // Switch to device settings tab
        this.switchTab('device');

        // Wait for DOM update
        await new Promise(resolve => setTimeout(resolve, 50));

        const otaUrlInput = document.getElementById('otaUrl');

        console.log('otaUrl element:', otaUrlInput);

        if (!otaUrlInput || !otaUrlInput.value) {
            this.addChatMessage('请输入OTA服务器地址', false);
            return;
        }

        const otaUrl = otaUrlInput.value;
        console.log('otaUrl value:', otaUrl);

        // Update dial button state to connecting
        const dialBtn = document.getElementById('dialBtn');
        if (dialBtn) {
            dialBtn.classList.add('dial-active');
            dialBtn.title = '连接中...';
            dialBtn.disabled = true;
        }

        // Show connecting message
        this.addChatMessage('正在连接服务器...', false);

        // 输入框现在始终可见，不需要额外显示

        try {

            // Get WebSocket handler instance
            const wsHandler = getWebSocketHandler();

            // Register connection state callback BEFORE connecting
            wsHandler.onConnectionStateChange = (isConnected) => {
                this.updateConnectionUI(isConnected);
                this.updateDialButton(isConnected);
            };

            // Register chat message callback BEFORE connecting
            wsHandler.onChatMessage = (text, isUser) => {
                this.addChatMessage(text, isUser);
            };

            // Register record button state callback BEFORE connecting
            wsHandler.onRecordButtonStateChange = (isRecording) => {
                const recordBtn = document.getElementById('recordBtn');
                if (recordBtn) {
                    if (isRecording) {
                        recordBtn.classList.add('recording');
                        recordBtn.title = '录音中';
                    } else {
                        recordBtn.classList.remove('recording');
                        recordBtn.title = '开始录音';
                    }
                }
            };

            const isConnected = await wsHandler.connect();

            if (isConnected) {
                // Check microphone availability (check again after connection)
                const { checkMicrophoneAvailability } = await import('../core/audio/recorder.js?v=0205');
                const micAvailable = await checkMicrophoneAvailability();

                if (!micAvailable) {
                    const isHttp = window.isHttpNonLocalhost;
                    if (isHttp) {
                        this.addChatMessage('⚠️ 当前由于是http访问，无法录音，只能用文字交互', false);
                    }
                    // Update global state
                    window.microphoneAvailable = false;
                }

                // Update dial button state
                const dialBtn = document.getElementById('dialBtn');
                if (dialBtn) {
                    if (!this.dialBtnDisabled) {
                        dialBtn.disabled = false;
                    }
                    dialBtn.title = '挂断';
                    dialBtn.classList.add('dial-active');
                }

                this.hideModal('settingsModal');
            } else {
                throw new Error('OTA连接失败');
            }
        } catch (error) {
            console.error('Connection error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });

            // Show error message
            const errorMessage = error.message.includes('Cannot set properties of null')
                ? '连接失败：请检查设备连接'
                : `连接失败: ${error.message}`;

            this.addChatMessage(errorMessage, false);

            // Restore dial button state
            const dialBtn = document.getElementById('dialBtn');
            if (dialBtn) {
                if (!this.dialBtnDisabled) {
                    dialBtn.disabled = false;
                }
                dialBtn.title = '拨号';
                dialBtn.classList.remove('dial-active');
                console.log('Dial button state restored successfully');
            }
        }
    }

    // Add MCP tool
    addMCPTool() {
        const mcpToolsList = document.getElementById('mcpToolsList');
        if (!mcpToolsList) return;

        const toolId = `mcp-tool-${Date.now()}`;
        const toolDiv = document.createElement('div');
        toolDiv.className = 'properties-container';
        toolDiv.innerHTML = `
            <div class="property-item">
                <input type="text" placeholder="工具名称" value="新工具">
                <input type="text" placeholder="工具描述" value="工具描述">
                <button class="remove-property" onclick="uiController.removeMCPTool('${toolId}')">删除</button>
            </div>
        `;

        mcpToolsList.appendChild(toolDiv);
    }

    // Remove MCP tool
    removeMCPTool(toolId) {
        const toolElement = document.getElementById(toolId);
        if (toolElement) {
            toolElement.remove();
        }
    }

    // Update audio statistics display
    updateAudioStats() {
        const audioPlayer = getAudioPlayer();
        if (!audioPlayer) return;

        const stats = audioPlayer.getAudioStats();
        // Here can add audio statistics UI update logic
    }

    // Start audio statistics monitor
    startAudioStatsMonitor() {
        // Update audio statistics every 100ms
        this.audioStatsTimer = setInterval(() => {
            this.updateAudioStats();
        }, 100);
    }

    // Stop audio statistics monitor
    stopAudioStatsMonitor() {
        if (this.audioStatsTimer) {
            clearInterval(this.audioStatsTimer);
            this.audioStatsTimer = null;
        }
    }

    // Draw audio visualizer waveform
    drawVisualizer(dataArray) {
        if (!this.visualizerContext || !this.visualizerCanvas) return;

        this.visualizerContext.fillStyle = '#fafafa';
        this.visualizerContext.fillRect(0, 0, this.visualizerCanvas.width, this.visualizerCanvas.height);

        const barWidth = (this.visualizerCanvas.width / dataArray.length) * 2.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
            barHeight = dataArray[i] / 2;

            // Create gradient color: from purple to blue to green
            const gradient = this.visualizerContext.createLinearGradient(0, 0, 0, this.visualizerCanvas.height);
            gradient.addColorStop(0, '#8e44ad');
            gradient.addColorStop(0.5, '#3498db');
            gradient.addColorStop(1, '#1abc9c');

            this.visualizerContext.fillStyle = gradient;
            this.visualizerContext.fillRect(x, this.visualizerCanvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }

    // Update session status UI
    updateSessionStatus(isSpeaking) {
        // Here can add session status UI update logic
        // For example: update Live2D model's mouth movement status
    }

    // Update session emotion
    updateSessionEmotion(emoji) {
        // Here can add emotion update logic
        // For example: display emoji in status indicator
    }

    // 显示录音结果弹窗
    showRecordingResultModal(audioRecorder, statsText) {
        // 移除已存在的弹窗
        const existingModal = document.getElementById('recordingResultModal');
        if (existingModal) {
            existingModal.remove();
        }

        // 创建弹窗
        const modal = document.createElement('div');
        modal.id = 'recordingResultModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: #2f3136;
            border-radius: 12px;
            padding: 24px;
            max-width: 400px;
            width: 90%;
            color: #fff;
            font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
        `;

        content.innerHTML = `
            <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #00d4aa;">🎤 录音测试结果</h3>
            <pre style="background: #1a1a1a; padding: 12px; border-radius: 8px; font-size: 12px; white-space: pre-wrap; margin: 0 0 16px 0; color: #ddd;">${statsText}</pre>
            <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                <button id="playRecordingBtn" style="
                    background: #5865f2;
                    border: none;
                    color: white;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                ">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8,5.14V19.14L19,12.14L8,5.14Z" />
                    </svg>
                    播放录音
                </button>
                <button id="downloadRecordingBtn" style="
                    background: #00d4aa;
                    border: none;
                    color: white;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                ">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z" />
                    </svg>
                    下载 WAV
                </button>
                <button id="closeRecordingModalBtn" style="
                    background: #4f545c;
                    border: none;
                    color: white;
                    padding: 10px 20px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 14px;
                ">
                    关闭
                </button>
            </div>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        // 播放按钮
        content.querySelector('#playRecordingBtn').addEventListener('click', async () => {
            const success = await audioRecorder.playRecording();
            if (!success) {
                alert('播放失败，请重新录音');
            }
        });

        // 下载按钮
        content.querySelector('#downloadRecordingBtn').addEventListener('click', () => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            audioRecorder.downloadRecording(`recording-${timestamp}.wav`);
        });

        // 关闭按钮
        content.querySelector('#closeRecordingModalBtn').addEventListener('click', () => {
            modal.remove();
        });

        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }
}

// Create singleton instance
export const uiController = new UIController();

// Export class for module usage
export { UIController };
