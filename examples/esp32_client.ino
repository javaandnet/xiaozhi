// ESP32 WebSocket客户端示例代码
// 适用于Arduino IDE

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// WiFi配置
const char* ssid = "your_wifi_ssid";
const char* password = "your_wifi_password";

// 服务器配置
const char* serverHost = "192.168.1.100";  //  替换为你的服务器IP
const uint16_t serverPort = 3000;

// 设备配置
#define DEVICE_ID "esp32_sensor_001"
#define CLIENT_ID "esp32_client_001"

// 传感器配置
#define DHT_PIN 4
#define DHT_TYPE DHT22
DHT dht(DHT_PIN, DHT_TYPE);

// LED引脚
#define LED_PIN 2

WebSocketsClient webSocket;

unsigned long lastSensorUpdate = 0;
unsigned long sensorInterval = 5000;  // 5秒发送一次传感器数据

void setup() {
  Serial.begin(115200);
  
  // 初始化LED
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  
  // 初始化DHT传感器
  dht.begin();
  
  // 连接WiFi
  connectWiFi();
  
  // 配置WebSocket
  webSocket.begin(serverHost, serverPort, "/");
  webSocket.onEvent(webSocketEvent);
  
  // 设置请求头
  webSocket.setExtraHeaders("Authorization: Bearer your_token_here\r\nProtocol-Version: 1\r\nDevice-Id: " DEVICE_ID "\r\nClient-Id: " CLIENT_ID "\r\n");
  
  Serial.println("设备启动完成");
}

void loop() {
  webSocket.loop();
  
  // 定期发送传感器数据
  if (millis() - lastSensorUpdate > sensorInterval) {
    sendSensorData();
    lastSensorUpdate = millis();
  }
}

void connectWiFi() {
  Serial.print("连接WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.print(".");
  }
  
  Serial.println();
  Serial.print("WiFi连接成功，IP地址: ");
  Serial.println(WiFi.localIP());
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("WebSocket连接断开");
      reconnectWebSocket();
      break;
      
    case WStype_CONNECTED:
      Serial.println("WebSocket连接成功");
      sendHelloMessage();
      break;
      
    case WStype_TEXT:
      handleIncomingMessage((char*)payload);
      break;
      
    case WStype_ERROR:
      Serial.println("WebSocket错误");
      break;
  }
}

void reconnectWebSocket() {
  Serial.println("尝试重新连接...");
  delay(5000);
  webSocket.begin(serverHost, serverPort, "/");
}

void sendHelloMessage() {
  StaticJsonDocument<300> doc;
  doc["type"] = "hello";
  doc["version"] = 1;
  doc["transport"] = "websocket";
  
  JsonObject audio_params = doc.createNestedObject("audio_params");
  audio_params["format"] = "opus";
  audio_params["sample_rate"] = 16000;
  audio_params["channels"] = 1;
  audio_params["frame_duration"] = 60;
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  webSocket.sendTXT(jsonString);
  Serial.println("Hello消息已发送");
}

void sendSensorData() {
  // 读取传感器数据
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();
  
  // 检查传感器读数是否有效
  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("传感器读数无效");
    return;
  }
  
  // 发送温度数据
  sendSingleSensorData("temperature", temperature, "°C");
  
  // 发送湿度数据
  sendSingleSensorData("humidity", humidity, "%");
  
  Serial.printf("传感器数据已发送 - 温度: %.1f°C, 湿度: %.1f%%\n", temperature, humidity);
}

void sendSingleSensorData(const char* sensorType, float value, const char* unit) {
  StaticJsonDocument<200> doc;
  doc["type"] = "sensor_data";
  
  JsonObject payload = doc.createNestedObject("payload");
  payload["sensorType"] = sensorType;
  payload["value"] = value;
  payload["unit"] = unit;
  payload["timestamp"] = millis();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  webSocket.sendTXT(jsonString);
}

void handleIncomingMessage(char* message) {
  Serial.print("收到消息: ");
  Serial.println(message);
  
  StaticJsonDocument<300> doc;
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    Serial.print("JSON解析错误: ");
    Serial.println(error.c_str());
    return;
  }
  
  const char* msgType = doc["type"];
  
  if (strcmp(msgType, "hello") == 0) {
    handleHelloResponse(doc);
  } else if (strcmp(msgType, "iot") == 0) {
    handleIotCommand(doc);
  } else if (strcmp(msgType, "error") == 0) {
    const char* errorMsg = doc["message"];
    Serial.print("服务器错误: ");
    Serial.println(errorMsg);
  }
}

void handleHelloResponse(JsonDocument& doc) {
  const char* transport = doc["transport"];
  
  if (strcmp(transport, "websocket") == 0) {
    Serial.println("握手成功，开始发送设备信息");
    sendDeviceDescriptors();
  } else {
    Serial.println("握手失败：传输方式不匹配");
  }
}

void sendDeviceDescriptors() {
  StaticJsonDocument<400> doc;
  doc["type"] = "iot";
  
  JsonObject descriptors = doc.createNestedObject("descriptors");
  descriptors["device_id"] = DEVICE_ID;
  descriptors["name"] = "ESP32温湿度传感器";
  
  JsonObject capabilities = descriptors.createNestedObject("capabilities");
  capabilities["sensors"] = "temperature,humidity";
  capabilities["actuators"] = "led";
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  webSocket.sendTXT(jsonString);
  Serial.println("设备描述符已发送");
}

void handleIotCommand(JsonDocument& doc) {
  const char* command = doc["command"];
  
  if (command) {
    Serial.printf("收到IoT命令: %s\n", command);
    
    if (strcmp(command, "led_on") == 0) {
      digitalWrite(LED_PIN, HIGH);
      Serial.println("LED已开启");
    } else if (strcmp(command, "led_off") == 0) {
      digitalWrite(LED_PIN, LOW);
      Serial.println("LED已关闭");
    } else if (strcmp(command, "get_sensor_data") == 0) {
      sendSensorData();
    }
  }
}

// 可以添加发送设备状态更新的方法
void sendDeviceState() {
  StaticJsonDocument<200> doc;
  doc["type"] = "iot";
  
  JsonObject states = doc.createNestedObject("states");
  states["led"] = digitalRead(LED_PIN) ? "on" : "off";
  states["last_update"] = millis();
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  webSocket.sendTXT(jsonString);
  Serial.println("设备状态已更新");
}