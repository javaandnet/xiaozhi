import { EdgeTTS } from 'node-edge-tts';

console.log('🔍 探索 node-edge-tts API...');

// 查看类的原型方法
const tts = new EdgeTTS({ voice: 'zh-CN-XiaoxiaoNeural' });
console.log('应用查看实例方法:');
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(tts)));
console.log(Object.getOwnPropertyNames(tts));

// 查看静态方法
console.log('\n应用查看静态方法:');
console.log(Object.getOwnPropertyNames(EdgeTTS));

// 尝试不同的调用方式
console.log('\n尝试不同的调用方式:');

try {
  console.log('1. 检查 synthesize 方法:');
  console.log(typeof tts.synthesize);
} catch (e) {
  console.log('synthesize 方法不存在');
}

try {
  console.log('2. 检查 toBuffer 方法:');
  console.log(typeof tts.toBuffer);
} catch (e) {
  console.log('toBuffer 方法不存在');
}

try {
  console.log('3. 检查 generate 方法:');
  console.log(typeof tts.generate);
} catch (e) {
  console.log('generate 方法不存在');
}