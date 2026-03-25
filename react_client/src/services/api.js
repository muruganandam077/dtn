export class ApiService {
  constructor(serverHost, port = 8000, onMessageReceived) {
    // serverHost could be 'localhost' or an IP like '192.168.1.1'
    this.serverHost = serverHost;
    this.port = port;
    this.onMessageReceived = onMessageReceived;
    this.ws = null;
    this.reconnectTimer = null;
    this.isConnected = false;
  }

  getHttpUrl() {
    return `http://${this.serverHost}:${this.port}`;
  }

  getWsUrl() {
    return `ws://${this.serverHost}:${this.port}/ws`;
  }

  connectWebSocket(onStatusChange) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    
    try {
      this.ws = new WebSocket(this.getWsUrl());
      
      this.ws.onopen = () => {
        console.log("WebSocket Connected to Edge Server");
        this.isConnected = true;
        if(onStatusChange) onStatusChange(true);
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };
      
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (this.onMessageReceived) {
          this.onMessageReceived(msg);
        }
      };
      
      this.ws.onclose = () => {
        console.log("WebSocket Disconnected. Reconnecting...");
        this.isConnected = false;
        if(onStatusChange) onStatusChange(false);
        this.ws = null;
        this.reconnectTimer = setTimeout(() => this.connectWebSocket(onStatusChange), 3000);
      };
      
      this.ws.onerror = (err) => {
        console.error("WebSocket Error:", err);
        // Let onclose handle reconnect
      };
    } catch (err) {
      console.error("Connection error:", err);
      this.isConnected = false;
      if(onStatusChange) onStatusChange(false);
      this.reconnectTimer = setTimeout(() => this.connectWebSocket(onStatusChange), 3000);
    }
  }

  sendMessage(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  async fetchMessages() {
    try {
      const res = await fetch(`${this.getHttpUrl()}/api/messages`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error("Failed to fetch via HTTP", e);
    }
    return null;
  }
}
