import fs from 'fs';
import WebSocket from 'ws';
const { readFile } = fs.promises;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function connect() {
    const uri = `wss://127.0.0.1:10096`;  // 改为非加密连接
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(uri, [], {
            rejectUnauthorized: false,
        });
        ws.on('open', () => {
            console.log('连接成功');
            resolve(ws);
            setInterval(() => {
                ws.send('ping');
            }, 1000);
        });
        ws.on('message', (raw) => {
            const data = JSON.parse(Buffer.from(raw).toString('utf-8'));
            console.log('收到消息', data.text);
        });
        ws.on('error', (err) => {
            console.log('连接失败', err);
            reject(err);
        });
    });
}
async function main() {
    // 使用之前生成的WAV文件（PCM格式）
    const filepath = '/Users/fengleiren/git/xiaozhi/data/debug-audio/audio-1771497609121.wav';
    const mode = 'offline';  // 使用offline模式
    const useItn = false;  // SenseVoice模式不支持ITN

    // 读取hotword文件并构建fst_dict
    const fstDict = {
        '产教': 10,
        // '铲掉': 0
    };
    const hotwordMessage = JSON.stringify(fstDict);
    console.log(hotwordMessage);

    const ws = await connect();
    console.log('开始发送数据');
    // 音频参数配置
    const sampleRate = 16000; // WAV文件采样率
    const wavFormat = 'pcm';
    const chunk_size = [5, 10, 5];	// 表示流式模型latency配置，`[5,10,5]`，表示当前音频为600ms，并且回看300ms，又看300ms。
    const chunk_interval = 10;

    // 发送第一条消息
    // {"audio_fs":8000,"chunk_interval":10,"chunk_size":[5,10,5],"hotwords":"","is_speaking":true,"itn":true,"mode":"offline","wav_format":"pcm","wav_name":"demo"}, msg_data->msg={"access_num":0,"audio_fs":8000,"is_eof":false,"itn":true,"mode":"offline","wav_format":"pcm","wav_name":"demo"}
    const message = JSON.stringify({
        mode,
        chunk_size,
        chunk_interval,
        audio_fs: sampleRate,
        wav_name: 'demo', // 假设的wav名称
        wav_format: wavFormat,
        is_speaking: true,
        hotwords: hotwordMessage,
        itn: useItn
    });
    await ws.send(message);
    // 处理wav文件 - 跳过44字节的WAV头部
    const buf = await readFile(filepath);
    const pcmData = buf.slice(44);  // 跳过WAV头部，获取纯PCM数据
    let i = 0;
    // ws.send(buf);
    const int_chunk_size = 60 * chunk_size[1] / chunk_interval;
    const chunk = sampleRate / 1000 * int_chunk_size;
    console.log('开始发送文件内容', pcmData.length, 'bytes, chunk:', chunk);
    while (i < pcmData.length) {
        const sub = pcmData.subarray(i, i += chunk * 2);
        ws.send(sub);
        console.log('发送', i);
        await sleep(100);
    }
    console.log('文件内容发送结束');
    // await sleep(100000);
    // end 
    const endMessage = JSON.stringify({ is_speaking: false });
    await ws.send(endMessage);

    console.log('发送结束');

    // await ws.close();
    console.log('end');
}

main().catch(console.error);