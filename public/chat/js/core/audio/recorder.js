// Audio recording module - 使用原生 MediaRecorder API
import { log } from '../../utils/logger.js?v=0205';
import { getAudioPlayer } from './player.js?v=0205';

// Audio recorder class - 使用原生 MediaRecorder
export class AudioRecorder {
    constructor() {
        this.isRecording = false;
        this.audioContext = null;
        this.analyser = null;
        this.audioSource = null;
        this.mediaRecorder = null;
        this.audioBuffers = [];
        this.totalAudioSize = 0;
        this.visualizationRequest = null;
        this.recordingTimer = null;
        this.websocket = null;
        this.mediaStream = null;
        // Callback functions
        this.onRecordingStart = null;
        this.onRecordingStop = null;
        this.onVisualizerUpdate = null;
    }

    // Set WebSocket instance
    setWebSocket(ws) {
        this.websocket = ws;
    }

    // Get AudioContext instance
    getAudioContext() {
        return getAudioPlayer().getAudioContext();
    }

    // 检查支持的 MIME 类型
    getSupportedMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg'
        ];
        
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                log(`使用音频格式: ${type}`, 'info');
                return type;
            }
        }
        
        log('浏览器不支持 Opus 编码，将使用默认编码', 'warning');
        return '';
    }

    // Start recording
    async start() {
        if (this.isRecording) return false;
        try {
            // Check if WebSocketHandler instance exists
            const { getWebSocketHandler } = await import('../network/websocket.js?v=0205');
            const wsHandler = getWebSocketHandler();
            // If machine is speaking, send abort message
            if (wsHandler && wsHandler.isRemoteSpeaking && wsHandler.currentSessionId) {
                const abortMessage = { session_id: wsHandler.currentSessionId, type: 'abort', reason: 'wake_word_detected' };
                if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                    this.websocket.send(JSON.stringify(abortMessage));
                    log('已发送中止消息', 'info');
                }
            }

            log('请至少录制1-2秒音频以确保收集足够的数据', 'info');

            // 请求麦克风权限 - 在移动设备上需要用户交互触发
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000,
                    channelCount: 1
                }
            });

            this.audioContext = this.getAudioContext();

            // iOS Safari 需要恢复音频上下文
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
                log('录音前已恢复音频上下文', 'info');
            }

            // 创建音频分析器（用于可视化）
            this.audioSource = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.audioSource.connect(this.analyser);

            // 重置缓冲区
            this.audioBuffers = [];
            this.totalAudioSize = 0;

            // 获取支持的 MIME 类型
            const mimeType = this.getSupportedMimeType();

            // 创建 MediaRecorder
            const options = mimeType ? { mimeType, audioBitsPerSecond: 16000 } : { audioBitsPerSecond: 16000 };
            this.mediaRecorder = new MediaRecorder(this.mediaStream, options);

            // 数据可用时触发
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0 && this.isRecording) {
                    this.audioBuffers.push(event.data);
                    this.totalAudioSize += event.data.size;

                    // 通过 WebSocket 发送数据
                    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                        event.data.arrayBuffer().then(buffer => {
                            try {
                                this.websocket.send(buffer);
                                log(`发送音频数据: ${buffer.byteLength} bytes`, 'debug');
                            } catch (error) {
                                log(`WebSocket发送错误: ${error.message}`, 'error');
                            }
                        });
                    }
                }
            };

            // 录音开始
            this.mediaRecorder.onstart = () => {
                log('MediaRecorder 已启动', 'success');
            };

            // 录音停止
            this.mediaRecorder.onstop = () => {
                log('MediaRecorder 已停止', 'info');
            };

            // 错误处理
            this.mediaRecorder.onerror = (error) => {
                log(`MediaRecorder 错误: ${error.message || error}`, 'error');
            };

            // 开始录音
            this.isRecording = true;
            this.mediaRecorder.start(100); // 每100ms触发一次 ondataavailable

            // Send listening start message
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                const listenStartMsg = JSON.stringify({ type: 'listen', state: 'start' });
                this.websocket.send(listenStartMsg);
                log(`已发送录音开始消息: ${listenStartMsg}`, 'info');
            } else {
                log('WebSocket未连接，无法发送开始消息', 'error');
                this.isRecording = false;
                return false;
            }

            // Start visualization
            if (this.onVisualizerUpdate) {
                const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
                this.startVisualization(dataArray);
            }

            // Immediately notify recording start, update button state
            if (this.onRecordingStart) {
                this.onRecordingStart(0);
            }

            // Start recording timer
            let recordingSeconds = 0;
            this.recordingTimer = setInterval(() => {
                recordingSeconds += 0.1;
                if (this.onRecordingStart) {
                    this.onRecordingStart(recordingSeconds);
                }
            }, 100);

            log('已开始 MediaRecorder 录音', 'success');
            return true;
        } catch (error) {
            log(`录音启动错误: ${error.message}`, 'error');
            this.isRecording = false;
            return false;
        }
    }

    // Start visualization
    startVisualization(dataArray) {
        const draw = () => {
            this.visualizationRequest = requestAnimationFrame(() => draw());
            if (!this.isRecording) return;
            this.analyser.getByteFrequencyData(dataArray);
            if (this.onVisualizerUpdate) {
                this.onVisualizerUpdate(dataArray);
            }
        };
        draw();
    }

    // Stop recording
    async stop() {
        if (!this.isRecording) return false;
        try {
            this.isRecording = false;

            // 停止 MediaRecorder
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }

            // 停止媒体流
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
                this.mediaStream = null;
            }

            if (this.audioSource) {
                this.audioSource.disconnect();
                this.audioSource = null;
            }

            if (this.visualizationRequest) {
                cancelAnimationFrame(this.visualizationRequest);
                this.visualizationRequest = null;
            }

            if (this.recordingTimer) {
                clearInterval(this.recordingTimer);
                this.recordingTimer = null;
            }

            // Send listen stop message
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                const listenStopMsg = JSON.stringify({ type: 'listen', state: 'stop' });
                this.websocket.send(listenStopMsg);
                log('已发送录音停止消息: ' + listenStopMsg, 'info');
            }

            // Send end signal (empty frame)
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                const emptyFrame = new Uint8Array(0);
                this.websocket.send(emptyFrame);
                log('已发送空帧作为结束信号', 'info');
            }

            if (this.onRecordingStop) {
                this.onRecordingStop();
            }

            log(`已停止 MediaRecorder 录音，总数据量: ${this.totalAudioSize} bytes`, 'success');
            return true;
        } catch (error) {
            log(`录音停止错误: ${error.message}`, 'error');
            return false;
        }
    }

    // Get analyser
    getAnalyser() {
        return this.analyser;
    }
}

// Create singleton instance
let audioRecorderInstance = null;

export function getAudioRecorder() {
    if (!audioRecorderInstance) {
        audioRecorderInstance = new AudioRecorder();
    }
    return audioRecorderInstance;
}

/**
 * Check if microphone is available
 * @returns {Promise<boolean>} Returns true if available, false if not available
 */
export async function checkMicrophoneAvailability() {
    // Check if browser supports getUserMedia API
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        log('浏览器不支持getUserMedia API', 'warning');
        return false;
    }
    try {
        // Try to access microphone
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000, channelCount: 1 } });
        // Immediately stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());
        log('麦克风可用性检查成功', 'success');
        return true;
    } catch (error) {
        log(`麦克风不可用: ${error.message}`, 'warning');
        return false;
    }
}

/**
 * Check if it is HTTP non-localhost access
 * @returns {boolean} Returns true if it is HTTP non-localhost access
 */
export function isHttpNonLocalhost() {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    // Check if it is HTTP protocol
    if (protocol !== 'http:') {
        return false;
    }
    // localhost and 127.0.0.1 can use microphone
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return false;
    }
    // Private IP addresses can also use microphone (browser allows)
    if (hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
        return false;
    }
    // Other HTTP access is considered non-localhost
    return true;
}
